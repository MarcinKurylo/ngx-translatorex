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
   * Updates a setting in the extension's configuration section.
   *
   * @param key The setting to update.
   * @param newValue The new value to store.
   */
  public static updateConfigValue(key: string, newValue: string): void {
    vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).update(key, newValue);
  }
}