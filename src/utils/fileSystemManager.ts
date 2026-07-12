import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { NotificationManager } from './notificationManager';
import { ExtensionConfigManager } from './extensionConfigManager';
import { TranslationTree, flattenObject } from './translationUtils';
export class FileSystemManager {

  /** Flattened cache of the current language's translations, keyed by dotted key. */
  public static cache: {[key:string]: string};

  /** Active watcher for the configured translation file, recreated on config changes. */
  private static watcher: vscode.FileSystemWatcher | undefined;

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
   * Reads and parses the main translation file for the configured language.
   * Shows an error message and returns an empty object when the file is
   * missing or cannot be parsed.
   *
   * @returns The parsed translations object, or `{}` on failure.
   */
  public static async fetchJson(): Promise<TranslationTree> {
    try {
      const uri = await FileSystemManager.getUri();
      const file = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      return file.length ? JSON.parse(file) : {};
    } catch (e) {
      NotificationManager.showErrorMessage(`No file with ${ExtensionConfigManager.getConfigValue('language')} translations found`);
      return {};
    }
  }

  /**
   * Serializes the given object and writes it back to the main translation
   * file (pretty-printed, two-space indent) via the VS Code file system API,
   * so it also works in remote and virtual workspaces. Shows an error message
   * on failure.
   *
   * @param updatedJson The translations object to persist.
   * @returns `true` when the file was written, `false` on failure.
   */
  public static async saveJson(updatedJson: TranslationTree): Promise<boolean> {
    try {
      const uri = await FileSystemManager.getUri();
      const content = new TextEncoder().encode(JSON.stringify(updatedJson, null, 2) + '\n');
      await vscode.workspace.fs.writeFile(uri, content);
      return true;
    } catch (e) {
      NotificationManager.showErrorMessage(`Save json failed`);
      return false;
    }
  }

  /**
   * Re-reads the main translation file and rebuilds the flattened cache. Used to
   * keep the cache in sync after the file changes outside the extension.
   */
  public static async refreshCache(): Promise<void> {
    FileSystemManager.cache = flattenObject(await FileSystemManager.fetchJson());
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