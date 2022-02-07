import * as vscode from 'vscode';
import { Selection } from './models';
import * as fs from 'fs';
import { ConfigValue, EXTENSION_IDENTIFIER } from './const';

export class Utils {

  public static getConfigValue(key: ConfigValue): string | undefined {
    return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get(key);
  }

  public static updateConfigValue(key: string, newValue: string): void {
    vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).update(key, newValue);
  }

  public static async getUri(): Promise<vscode.Uri> {
    return (await vscode.workspace.findFiles(`${Utils.getConfigValue('path')}${Utils.getConfigValue('language')}.json`))[0];
  }

  public static async fetchJson(): Promise<any> {
    try {
      const uri = await Utils.getUri();
      const file = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(file.toLocaleString());
    } catch (e) {
      Utils.showErrorMessage(`No file with ${Utils.getConfigValue('language')} translations found`);
    }
  }

  public static checkIfKeyValid(key: string): boolean {
    if (Utils.getConfigValue('mode') === 'key') {
      return !key.startsWith('.') && !key.includes('..') && !key.endsWith('.');
    }
    return !key.startsWith('.') && !key.includes('..');
  }

  public static async saveJson(updatedJson: unknown): Promise<void> {
    try {
      fs.writeFileSync((await Utils.getUri()).fsPath, JSON.stringify(updatedJson, null, 2) + '\n');
    } catch (e) {
      Utils.showErrorMessage(`Save json failed`);
    }
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
          if (typeof json[objectKey] === 'string' || (typeof json[objectKey] === 'object' && !!Object.keys(json[objectKey]).length)) {
            Utils.showInfoMessage(`Existing i18n key overwritten with new value!`);
          }
          return json[objectKey] = value;
        } else {
          return Utils.setKey(keys.slice(1).join('.'), json[objectKey], value);
        }
      }
    }
  }

  public static sortJson(json: {[key: string]: any}): {[key: string]: any} {
    const sortedObj: {[key: string]: any} = {};
    const keys = Object.keys(json).sort((key1, key2) => key1.toLocaleLowerCase().localeCompare(key2.toLocaleLowerCase()));
    for(let key of keys){
      if(typeof json[key] === 'object'){
        sortedObj[key] = Utils.sortJson(json[key]);
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

  public static prepareSnippet(key: string, languageId: string, paramsMap: {[key:string]: string}): vscode.SnippetString {
    let snippet: vscode.SnippetString;
    switch(languageId) {
      case 'typescript':
        snippet = new vscode.SnippetString(`'${key}'`);
        break;
      case 'html':
        let snippetText = `{{ '${key}' | translate }}`;
        if (Object.keys(paramsMap).length) {
          snippetText = `${snippetText.split(' }}')[0]}:{`;
          for (const key in paramsMap) {
            snippetText += ` ${key}:${paramsMap[key]}`;
          }
          snippetText += '} }}';
        }
        snippet = new vscode.SnippetString(snippetText);
        break;
    }
    return snippet!;
  }

  public static splitParamNames(key: string): [string, string[]] {
    const [newKey, ...paramNames] = key.split(':');
    return [newKey, paramNames];
  }

  public static checkForParamsInSelection(selection: string): RegExpMatchArray[] {
    const paramTest = new RegExp(/{{.*?}}/, 'g');
    const params = [...selection.matchAll(paramTest)];
    return params;
  }

  public static renameParams(selection: string, paramNames: string[]): string {
    const params = Utils.checkForParamsInSelection(selection)
    params.forEach((param, id) => {
      if (paramNames[id]) {
        selection = selection.replace(param[0], ` {{ ${paramNames[id]} }} `);
      }
    });
    return selection;
  }

  public static generateKey(key: string, value: string): string {
    if (key.endsWith('.')) {
      return key.slice(0, -1);
    }
    value = value.toLocaleLowerCase().replace(/[`~!@#$%^&*()_|+\-=?;:{}'",<>\{\}\[\]\\\/]/gi, ' ').split(' ').join('_').replace('__', '_');
    const underscoreTest = new RegExp(/_{2,}/, 'g');
    const underscoreMatches = [...value.matchAll(underscoreTest)];
    underscoreMatches.forEach(match => {
      value = value.replace(match[0], '_');
    });
    if (value.endsWith('_')) {
      value = value.slice(0, -1);
    }
    return `${key}.${value}`;
  }

  public static insertSnippet(key: string, languageId: string, range: vscode.Range, paramsMap: {[key:string]: string}) {
    const snippet = Utils.prepareSnippet(key, languageId, paramsMap);
    vscode.window.activeTextEditor?.insertSnippet(snippet, range);
  }

  public static showInfoMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  public static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}