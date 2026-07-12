import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { NotificationManager } from './notificationManager';
import { ExtensionConfigManager } from './extensionConfigManager';
import { TranslationTree } from './translationUtils';
export class FileSystemManager {

  /** Flattened cache of the current language's translations, keyed by dotted key. */
  public static cache: {[key:string]: string};

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
}