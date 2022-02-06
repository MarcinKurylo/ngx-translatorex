import * as vscode from 'vscode';
import * as fs from 'fs'

export class Utils {

  public static readonly EXTENSION_IDENTIFIER = 'ngx-translatorex';

  public static getConfigValue(key: string): string | undefined {
    return vscode.workspace.getConfiguration(this.EXTENSION_IDENTIFIER).get(key);
  }

  public static updateConfigValue(key: string, newValue: string): void {
    vscode.workspace.getConfiguration(this.EXTENSION_IDENTIFIER).update(key, newValue);
  }

  public static async getUri(): Promise<vscode.Uri> {
    return (await vscode.workspace.findFiles(`${this.getConfigValue('path')}${this.getConfigValue('language')}.json`))[0];
  }

  public static async fetchJson(): Promise<any> {
    try {
      const uri = await this.getUri();
      const file = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(file.toLocaleString());
    } catch (e) {
      this.showErrorMessage(`No file with ${this.getConfigValue('language')} translations found`);
    }
  }

  public static async saveJson(updatedJson: unknown): Promise<void> {
    fs.writeFileSync((await Utils.getUri()).fsPath, JSON.stringify(updatedJson, null, 2));
  }

  public static setKey(key: string, json: {[key:string]: any}, value: string): any {
    const keys = key.split('.');
    if (keys.length === 0) { return; }
    if (!Reflect.has(json, keys[0])) {
      json[keys[0]] = {};
    }
    for (const objectKey in json) {
      if (objectKey === keys[0]) {
        if (keys.length === 1) {
          return json[objectKey] = value;
        } else {
          return this.setKey(keys.slice(1).join('.'), json[objectKey], value);
        }
      }
    }

  }

  public static showInfoMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  public static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}