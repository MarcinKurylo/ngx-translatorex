import * as vscode from 'vscode';
import { ConfigValue, EXTENSION_IDENTIFIER } from '../const';
export class ExtensionConfigManager {
  public static getConfigValue(key: ConfigValue): string | undefined {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get(key);
  }

  public static updateConfigValue(key: string, newValue: string): void {
    vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).update(key, newValue);
  }
}