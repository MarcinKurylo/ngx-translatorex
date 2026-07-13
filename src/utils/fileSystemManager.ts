import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { NotificationManager } from './notificationManager';
import { ExtensionConfigManager } from './extensionConfigManager';
import { TranslationTree, deleteKey, flattenObject, renameKey, setKey } from './translationUtils';
export class FileSystemManager {

  /** Flattened cache of the current language's translations, keyed by dotted key. */
  public static cache: {[key:string]: string};

  /** Active watcher for the configured translation file, recreated on config changes. */
  private static watcher: vscode.FileSystemWatcher | undefined;

  /** Optional listener invoked whenever the cache is rebuilt, so dependents (e.g. diagnostics) can refresh. */
  public static onCacheChanged: (() => void) | undefined;

  /**
   * Resolves the URI of the main translation file for the configured language,
   * searching the workspace with the configured i18n path glob.
   *
   * @returns The URI of the first matching `<language>.json` file.
   */
  public static async getUri(): Promise<vscode.Uri> {
    return (await vscode.workspace.findFiles(`${ExtensionConfigManager.getConfigValue('path')}${ExtensionConfigManager.getConfigValue('language')}.json`))[0];
  }

  /**
   * Resolves the URIs of every language file in the configured i18n folder
   * (every `*.json` under the configured path), so a new key can be synced
   * across all languages.
   *
   * @returns The URIs of all translation files in the i18n folder.
   */
  public static async getLanguageUris(): Promise<vscode.Uri[]> {
    return [...await vscode.workspace.findFiles(`${ExtensionConfigManager.getConfigValue('path')}*.json`)];
  }

  /**
   * Reads and parses every language file in the i18n folder, deriving each
   * language code from the file name. Sorted by language for stable output.
   *
   * @returns One entry per language file, with its parsed translations tree.
   */
  public static async getAllLanguageTranslations(): Promise<{ language: string; tree: TranslationTree }[]> {
    const uris = await FileSystemManager.getLanguageUris();
    const languages = [];
    for (const uri of uris) {
      const language = uri.path.split('/').pop()!.replace(/\.json$/, '');
      languages.push({ language, tree: await FileSystemManager.readJson(uri) });
    }
    return languages.sort((a, b) => a.language.localeCompare(b.language));
  }

  /**
   * Reads and parses the translation file at the given URI.
   *
   * @returns The parsed translations object, or `{}` when the file is empty.
   */
  private static async readJson(uri: vscode.Uri): Promise<TranslationTree> {
    const file = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    return file.length ? JSON.parse(file) : {};
  }

  /**
   * Serializes and writes a translations object to the given URI
   * (pretty-printed, two-space indent) via the VS Code file system API, so it
   * also works in remote and virtual workspaces.
   */
  private static async writeJson(uri: vscode.Uri, tree: TranslationTree): Promise<void> {
    const content = new TextEncoder().encode(JSON.stringify(tree, null, 2) + '\n');
    await vscode.workspace.fs.writeFile(uri, content);
  }

  /**
   * Reads and parses the main translation file for the configured language.
   * Shows an error message and returns an empty object when the file is
   * missing or cannot be parsed.
   *
   * @returns The parsed translations object, or `{}` on failure.
   */
  public static async fetchJson(): Promise<TranslationTree> {
    try {
      return await FileSystemManager.readJson(await FileSystemManager.getUri());
    } catch (e) {
      NotificationManager.showErrorMessage(`No file with ${ExtensionConfigManager.getConfigValue('language')} translations found`);
      return {};
    }
  }

  /**
   * Serializes the given object and writes it back to the main translation
   * file. Shows an error message on failure.
   *
   * @param updatedJson The translations object to persist.
   * @returns `true` when the file was written, `false` on failure.
   */
  public static async saveJson(updatedJson: TranslationTree): Promise<boolean> {
    try {
      await FileSystemManager.writeJson(await FileSystemManager.getUri(), updatedJson);
      return true;
    } catch (e) {
      NotificationManager.showErrorMessage(`Save json failed`);
      return false;
    }
  }

  /**
   * Writes a new key into the i18n folder. The real value goes into the main
   * language file; when multi-language sync is enabled, every other language
   * also receives a placeholder so the key exists everywhere and untranslated
   * languages stay visible. Existing values in secondary languages are never
   * overwritten. When sync is disabled, only the main language file is touched.
   *
   * @param key The dotted translation key to add.
   * @param value The value for the main language.
   * @returns `saved` — whether the write succeeded; `overwritten` — whether an
   * existing value in the main file was replaced.
   */
  public static async addTranslation(key: string, value: string): Promise<{ saved: boolean; overwritten: boolean }> {
    try {
      const mainUri = await FileSystemManager.getUri();
      const uris = await FileSystemManager.getLanguageUris();
      const sync = ExtensionConfigManager.getBooleanConfigValue('syncLanguages', true);
      const placeholder = ExtensionConfigManager.getPlaceholder();
      let overwritten = false;
      for (const uri of uris) {
        const isMain = uri.toString() === mainUri.toString();
        if (!isMain && !sync) {
          continue;
        }
        const tree = await FileSystemManager.readJson(uri);
        const result = isMain
          ? setKey(tree, key, value)
          : setKey(tree, key, placeholder, { overwrite: false });
        if (isMain) {
          overwritten = result.overwritten;
        }
        if (result.written) {
          await FileSystemManager.writeJson(uri, tree);
        }
      }
      return { saved: true, overwritten };
    } catch (e) {
      NotificationManager.showErrorMessage(`Save json failed`);
      return { saved: false, overwritten: false };
    }
  }

  /**
   * Renames a key in every language file in the i18n folder, moving each file's
   * own value (or subtree) to the new key. Files that do not contain the key are
   * left untouched.
   *
   * @param oldKey The existing dotted key to rename.
   * @param newKey The new dotted key.
   * @returns `saved` — whether all writes succeeded; `changed` — how many files
   * were actually modified.
   */
  public static async renameTranslation(oldKey: string, newKey: string): Promise<{ saved: boolean; changed: number }> {
    return FileSystemManager.mutateAllLanguages((tree) => renameKey(tree, oldKey, newKey));
  }

  /**
   * Deletes a key from every language file in the i18n folder, pruning any
   * subtrees left empty by the removal. Files that do not contain the key are
   * left untouched.
   *
   * @param key The dotted key to delete.
   * @returns `saved` — whether all writes succeeded; `changed` — how many files
   * were actually modified.
   */
  public static async deleteTranslation(key: string): Promise<{ saved: boolean; changed: number }> {
    return FileSystemManager.mutateAllLanguages((tree) => deleteKey(tree, key));
  }

  /**
   * Applies a mutation to every language file in the i18n folder, writing back
   * only the files the mutation actually changed.
   *
   * @param mutate A function that mutates a tree in place and returns whether it
   * changed anything.
   * @returns `saved` — whether all writes succeeded; `changed` — how many files
   * were modified.
   */
  private static async mutateAllLanguages(
    mutate: (tree: TranslationTree) => boolean
  ): Promise<{ saved: boolean; changed: number }> {
    try {
      const uris = await FileSystemManager.getLanguageUris();
      let changed = 0;
      for (const uri of uris) {
        const tree = await FileSystemManager.readJson(uri);
        if (mutate(tree)) {
          await FileSystemManager.writeJson(uri, tree);
          changed++;
        }
      }
      return { saved: true, changed };
    } catch (e) {
      NotificationManager.showErrorMessage('Save json failed');
      return { saved: false, changed: 0 };
    }
  }

  /**
   * Collects every secondary-language key still holding the placeholder for which
   * the main language has a real value, so those can be auto-translated. Purely
   * read-only — the returned items feed a confirmation prompt before any writes.
   *
   * @param placeholder The placeholder value that marks an untranslated key.
   * @returns One item per fillable placeholder, with the target language, key and
   * the main-language source text.
   */
  public static async collectPlaceholders(
    placeholder: string
  ): Promise<{ uri: vscode.Uri; language: string; key: string; source: string }[]> {
    const mainUri = await FileSystemManager.getUri();
    const uris = await FileSystemManager.getLanguageUris();
    const mainFlat = flattenObject(await FileSystemManager.readJson(mainUri));
    const items: { uri: vscode.Uri; language: string; key: string; source: string }[] = [];
    for (const uri of uris) {
      if (uri.toString() === mainUri.toString()) {
        continue;
      }
      const language = uri.path.split('/').pop()!.replace(/\.json$/, '');
      const flat = flattenObject(await FileSystemManager.readJson(uri));
      for (const key of Object.keys(flat)) {
        if (flat[key] === placeholder && typeof mainFlat[key] === 'string' && mainFlat[key] !== placeholder) {
          items.push({ uri, language, key, source: mainFlat[key] });
        }
      }
    }
    return items;
  }

  /**
   * Fills the given placeholder items by calling `translate` for each and writing
   * the results back, one write per affected language file. Translations that
   * come back empty or that failed validation (returned `undefined`) are counted
   * as skipped and leave the placeholder untouched. Honours cancellation.
   *
   * @returns `saved` — whether writes succeeded; `filled`/`skipped` — item counts.
   */
  public static async applyPlaceholderTranslations(
    items: { uri: vscode.Uri; language: string; key: string; source: string }[],
    translate: (source: string, language: string) => Promise<string | undefined>,
    report: (done: number, total: number) => void,
    token: vscode.CancellationToken
  ): Promise<{ saved: boolean; filled: number; skipped: number }> {
    try {
      const trees = new Map<string, { uri: vscode.Uri; tree: TranslationTree }>();
      for (const item of items) {
        const key = item.uri.toString();
        if (!trees.has(key)) {
          trees.set(key, { uri: item.uri, tree: await FileSystemManager.readJson(item.uri) });
        }
      }
      const changed = new Set<string>();
      let filled = 0;
      let skipped = 0;
      let done = 0;
      for (const item of items) {
        if (token.isCancellationRequested) {
          break;
        }
        let translated: string | undefined;
        try {
          translated = await translate(item.source, item.language);
        } catch {
          translated = undefined;
        }
        if (translated) {
          setKey(trees.get(item.uri.toString())!.tree, item.key, translated);
          changed.add(item.uri.toString());
          filled++;
        } else {
          skipped++;
        }
        report(++done, items.length);
      }
      for (const key of changed) {
        const entry = trees.get(key)!;
        await FileSystemManager.writeJson(entry.uri, entry.tree);
      }
      return { saved: true, filled, skipped };
    } catch (e) {
      NotificationManager.showErrorMessage('Save json failed');
      return { saved: false, filled: 0, skipped: 0 };
    }
  }

  /**
   * Writes a single key/value into one language file (creating nested subtrees as
   * needed), used by the agent `setTranslation` tool. When the target is the main
   * language, the flattened cache is updated too.
   *
   * @returns `true` on success, `false` when the language file is missing or the
   * write fails.
   */
  public static async setTranslationForLanguage(language: string, key: string, value: string): Promise<boolean> {
    try {
      const uris = await FileSystemManager.getLanguageUris();
      const uri = uris.find((candidate) => candidate.path.split('/').pop() === `${language}.json`);
      if (!uri) {
        NotificationManager.showErrorMessage(`No ${language}.json found in the i18n folder`);
        return false;
      }
      const tree = await FileSystemManager.readJson(uri);
      setKey(tree, key, value);
      await FileSystemManager.writeJson(uri, tree);
      if (language === (ExtensionConfigManager.getConfigValue('language') ?? 'en')) {
        FileSystemManager.cache[key] = value;
        FileSystemManager.onCacheChanged?.();
      }
      return true;
    } catch (e) {
      NotificationManager.showErrorMessage('Save json failed');
      return false;
    }
  }

  /**
   * Re-reads the main translation file and rebuilds the flattened cache. Used to
   * keep the cache in sync after the file changes outside the extension.
   */
  public static async refreshCache(): Promise<void> {
    FileSystemManager.cache = flattenObject(await FileSystemManager.fetchJson());
    FileSystemManager.onCacheChanged?.();
  }

  /**
   * (Re)creates a file system watcher for the configured translation file so the
   * cache is refreshed whenever the file is created, changed or deleted outside
   * the extension (e.g. manual edits, a git pull or branch switch). Any previous
   * watcher is disposed first, so this can be called again after config changes.
   */
  public static watchTranslationFile(): void {
    FileSystemManager.watcher?.dispose();
    const pattern = `${ExtensionConfigManager.getConfigValue('path')}${ExtensionConfigManager.getConfigValue('language')}.json`;
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = () => FileSystemManager.refreshCache();
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    FileSystemManager.watcher = watcher;
  }

  /** Disposes the active translation file watcher, if any. */
  public static disposeWatcher(): void {
    FileSystemManager.watcher?.dispose();
    FileSystemManager.watcher = undefined;
  }
}