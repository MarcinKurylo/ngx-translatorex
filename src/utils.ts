import * as vscode from 'vscode';
import { Selection } from './models';
import * as fs from 'fs';

export class Utils {

  // eslint-disable-next-line @typescript-eslint/naming-convention
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

  public static checkIfKeyValid(key: string): boolean {
    if (this.getConfigValue('mode') === 'key') {
      return !key.startsWith('.') || !key.includes('..') || !key.endsWith('.');
    }
    return !key.startsWith('.') || !key.includes('..');
  }

  public static async saveJson(updatedJson: unknown): Promise<void> {
    fs.writeFileSync((await Utils.getUri()).fsPath, JSON.stringify(updatedJson, null, 2) + '\n');
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

  public static sortJson(json: {[key: string]: any}): {[key: string]: any} {
    const sortedObj: {[key: string]: any} = {};
    const keys = Object.keys(json).sort((key1, key2) => key1.toLocaleLowerCase().localeCompare(key2.toLocaleLowerCase()));
    for(let key of keys){
      if(typeof json[key] === 'object'){
        sortedObj[key] = this.sortJson(json[key]);
      } else {
        sortedObj[key] = json[key];
      }
    }
    return sortedObj;
  }

  public static getSelection(): Selection {
    const userSelection = vscode.window.activeTextEditor?.selection;
    const selection: Selection = {
      text: vscode.window.activeTextEditor?.document.getText(userSelection)!,
      languageId: vscode.window.activeTextEditor?.document.languageId!,
      range: new vscode.Range(userSelection!.start, userSelection!.end)
    };
    return selection;
  }

  public static prepareSnippet(key: string, languageId: string): vscode.SnippetString {
    let snippet: vscode.SnippetString;
    switch(languageId) {
      case 'typescript':
        snippet = new vscode.SnippetString(`'${key}'`);
        break;
      case 'html':
        snippet = new vscode.SnippetString(`{{ '${key}' | translate }}`);
        break;
    }
    return snippet!;
  }

  public static generateKey(key: string, value: string): string {
    if (key.endsWith('.')) {
      return key.slice(0, -1);
    }
    value = value.split(' ').join('_');
    return `${key}.${value}`;
  }

  public static insertSnippet(key: string, languageId: string, range: vscode.Range) {
    const snippet = this.prepareSnippet(key, languageId);
    vscode.window.activeTextEditor?.insertSnippet(snippet, range);
  }

  public static showInfoMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  public static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}