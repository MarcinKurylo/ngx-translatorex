import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { NotificationManager } from './notificationManager';
import { ExtensionConfigManager } from './extensionConfigManager';
import { MISSING_TRANSLATION_PLACEHOLDER } from '../const';
import { TranslationTree, flattenObject, setKey } from './translationUtils';
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
   * Writes a new key into every language file in the i18n folder: the real
   * value goes into the main language file, while all other languages receive a
   * placeholder so the key exists everywhere and untranslated languages stay
   * visible. Existing values in secondary languages are never overwritten.
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
      let overwritten = false;
      for (const uri of uris) {
        const isMain = uri.toString() === mainUri.toString();
        const tree = await FileSystemManager.readJson(uri);
        const result = isMain
          ? setKey(tree, key, value)
          : setKey(tree, key, MISSING_TRANSLATION_PLACEHOLDER, { overwrite: false });
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