import * as vscode from 'vscode';
import { ArrayConfigValue, BooleanConfigValue, ConfigValue, EXTENSION_IDENTIFIER, MISSING_TRANSLATION_PLACEHOLDER, NumberConfigValue } from '../const';
export class ExtensionConfigManager {
  /**
   * Reads a string setting from the extension's configuration section.
   *
   * @param key The setting to read (`language`, `mode`, `path` or `placeholder`).
   * @returns The configured value, or `undefined` when unset.
   */
  public static getConfigValue(key: ConfigValue): string | undefined {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get(key);
  }

  /**
   * Reads a boolean setting from the extension's configuration section.
   *
   * @param key The setting to read (`diagnostics` or `syncLanguages`).
   * @param fallback The value to use when the setting is unset.
   * @returns The configured boolean, or `fallback` when unset.
   */
  public static getBooleanConfigValue(key: BooleanConfigValue, fallback: boolean): boolean {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get<boolean>(key) ?? fallback;
  }

  /**
   * Reads a numeric setting from the extension's configuration section.
   *
   * @param key The setting to read (`hardcodedStringsMinLength`).
   * @param fallback The value to use when the setting is unset.
   * @returns The configured number, or `fallback` when unset.
   */
  public static getNumberConfigValue(key: NumberConfigValue, fallback: number): number {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get<number>(key) ?? fallback;
  }

  /**
   * Reads a string-array setting from the extension's configuration section.
   *
   * @param key The setting to read (`hardcodedStringsIgnore`).
   * @returns The configured array, or an empty array when unset.
   */
  public static getArrayConfigValue(key: ArrayConfigValue): string[] {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get<string[]>(key) ?? [];
  }

  /**
   * Resolves the placeholder written into secondary language files for new keys,
   * falling back to the built-in default when the setting is unset or empty.
   */
  public static getPlaceholder(): string {
    return ExtensionConfigManager.getConfigValue('placeholder') || MISSING_TRANSLATION_PLACEHOLDER;
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