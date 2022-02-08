import * as vscode from 'vscode';
import * as fs from 'fs';
import { NotificationManager } from './notificationManager';
import { ExtensionConfigManager } from './extensionConfigManager';
export class FileSystemManager {
  public static async getUri(): Promise<vscode.Uri> {
    return (await vscode.workspace.findFiles(`${ExtensionConfigManager.getConfigValue('path')}${ExtensionConfigManager.getConfigValue('language')}.json`))[0];
  }

  public static async fetchJson(): Promise<any> {
    try {
      const uri = await FileSystemManager.getUri();
      const file = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(file.toLocaleString());
    } catch (e) {
      NotificationManager.showErrorMessage(`No file with ${ExtensionConfigManager.getConfigValue('language')} translations found`);
    }
  }

  public static async saveJson(updatedJson: unknown): Promise<void> {
    try {
      fs.writeFileSync((await FileSystemManager.getUri()).fsPath, JSON.stringify(updatedJson, null, 2) + '\n');
    } catch (e) {
      NotificationManager.showErrorMessage(`Save json failed`);
    }
  }
}