import * as vscode from 'vscode';
import { ConfigValue, EXTENSION_IDENTIFIER } from '../const';
export class ExtensionConfigManager {
  /**
   * Reads a setting from the extension's configuration section.
   *
   * @param key The setting to read (`language`, `mode` or `path`).
   * @returns The configured value, or `undefined` when unset.
   */
  public static getConfigValue(key: ConfigValue): string | undefined {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get(key);
  }

  /**
   * Updates a setting in the extension's configuration section. Writes to the
   * workspace when a folder is open, otherwise to the global (user) settings.
   *
   * @param key The setting to update.
   * @param newValue The new value to store.
   * @returns A thenable that resolves once the setting has been written.
   */
  public static updateConfigValue(key: string, newValue: string): Thenable<void> {
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).update(key, newValue, target);
  }
}