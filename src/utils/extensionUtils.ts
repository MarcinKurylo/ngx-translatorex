import * as vscode from 'vscode';
import { Selection } from '../models';
import { ExtensionConfigManager } from './extensionConfigManager';
import { NotificationManager } from './notificationManager';

export class ExtensionUtils {

  public static checkIfKeyValid(key: string): boolean {
    if (ExtensionConfigManager.getConfigValue('mode') === 'key') {
      return !key.startsWith('.') && !key.includes('..') && !key.endsWith('.');
    }
    return !key.startsWith('.') && !key.includes('..');
  }

  public static setKey(key: string, object: {[key:string]: any}, value: string): any {
    const keys = key.split('.');
    if (keys.length === 0) { return; }
    if (!Reflect.has(object, keys[0])) {
      object[keys[0]] = {};
    }
    for (const objectKey in object) {
      if (objectKey === keys[0]) {
        if (keys.length === 1) {
          if (typeof object[objectKey] === 'string' || (typeof object[objectKey] === 'object' && !!Object.keys(object[objectKey]).length)) {
            NotificationManager.showInfoMessage(`Existing i18n key overwritten with new value!`);
          }
          return object[objectKey] = value;
        } else {
          return ExtensionUtils.setKey(keys.slice(1).join('.'), object[objectKey], value);
        }
      }
    }
  }

  public static flattenObject(object: {[key: string]: any}, tail?: string): {[key: string]: string} {
    let flatObject: {[key: string]: string} = {};
    for (const key in object) {
      if (typeof object[key] === 'object') {
        tail = tail ? `${tail}.${key}` : key;
        flatObject = {...flatObject, ...ExtensionUtils.flattenObject(object[key], tail)};
        tail = tail?.split('.').slice(0, -1).join('.');
      } else {
        flatObject[tail? `${tail}.${key}` : key] = object[key];
      }
    }
    return flatObject;
  }

  public static sortObject(object: {[key: string]: any}): {[key: string]: any} {
    const sortedObj: {[key: string]: any} = {};
    const keys = Object.keys(object).sort((key1, key2) => key1.toLocaleLowerCase().localeCompare(key2.toLocaleLowerCase()));
    for(let key of keys){
      if(typeof object[key] === 'object'){
        sortedObj[key] = ExtensionUtils.sortObject(object[key]);
      } else {
        sortedObj[key] = object[key];
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
    const params = ExtensionUtils.checkForParamsInSelection(selection);
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
    const snippet = ExtensionUtils.prepareSnippet(key, languageId, paramsMap);
    vscode.window.activeTextEditor?.insertSnippet(snippet, range);
  }

}