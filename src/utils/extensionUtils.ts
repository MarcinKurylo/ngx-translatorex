import * as vscode from 'vscode';
import { Selection } from '../models';
import { ExtensionConfigManager } from './extensionConfigManager';
import { NotificationManager } from './notificationManager';

export class ExtensionUtils {

  /**
   * Validates a translation key against the current extension mode.
   *
   * A key may never start with a dot or contain empty segments (`..`).
   * In `key` mode it additionally must not end with a dot; in `scope`
   * mode a trailing dot is allowed (the value-based slug is appended later).
   *
   * @param key The dotted key entered by the user.
   * @returns `true` when the key is syntactically valid for the current mode.
   */
  public static checkIfKeyValid(key: string): boolean {
    if (ExtensionConfigManager.getConfigValue('mode') === 'key') {
      return !key.startsWith('.') && !key.includes('..') && !key.endsWith('.');
    }
    return !key.startsWith('.') && !key.includes('..');
  }

  /**
   * Inserts a value into a nested object under a dotted key, creating any
   * missing intermediate objects along the way.
   *
   * When the target key already holds a string or a non-empty object, an
   * information message is shown to warn that an existing entry is overwritten.
   *
   * @param key The dotted key, e.g. `home.header.title`.
   * @param object The translations object to mutate in place.
   * @param value The translation text to store.
   */
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

  /**
   * Flattens a nested translations object into a single-level map whose keys
   * are the dotted paths to each leaf value (e.g. `{ a: { b: 'x' } }` becomes
   * `{ 'a.b': 'x' }`). Used to build the completion/hover cache.
   *
   * @param object The nested object to flatten.
   * @param tail Internal accumulator for the current key prefix; omit when calling.
   * @returns A flat map of dotted keys to their string values.
   */
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

  /**
   * Returns a deep copy of the object with keys sorted alphabetically
   * (case-insensitive) at every level. Used by the "Sort Main i18n json file"
   * command to keep translation files tidy.
   *
   * @param object The translations object to sort.
   * @returns A new object with recursively sorted keys.
   */
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

  /**
   * Reads the current selection from the active text editor.
   *
   * @returns The selected text together with its language id and range, or
   * `undefined` when there is no active editor or the selection is empty.
   */
  public static getSelection(): Selection | undefined {
    const editor = vscode.window.activeTextEditor;
    const userSelection = editor?.selection;
    if (!editor || !userSelection || userSelection.isEmpty) {
      return undefined;
    }
    return {
      text: editor.document.getText(userSelection),
      languageId: editor.document.languageId,
      range: new vscode.Range(userSelection.start, userSelection.end)
    };
  }

  /**
   * Builds the snippet that replaces the original selection: the bare key in
   * TypeScript, or a `{{ 'key' | translate }}` pipe expression in HTML,
   * expanded with a params object when parameters are present.
   *
   * @param key The translation key to reference.
   * @param languageId The language of the edited document (`typescript` or `html`).
   * @param paramsMap Map of translation param names to their source expressions.
   * @returns The snippet to insert at the selection range.
   */
  public static prepareSnippet(key: string, languageId: string, paramsMap: {[key:string]: string}): vscode.SnippetString {
    let snippet: vscode.SnippetString;
    switch(languageId) {
      case 'typescript':
        snippet = new vscode.SnippetString(`${key}`);
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

  /**
   * Splits a user-provided key of the form `key:param1:param2` into the key
   * and the list of custom parameter names to apply to the selection's params.
   *
   * @param key The raw input, optionally suffixed with `:`-separated param names.
   * @returns A tuple of `[key, paramNames]`.
   */
  public static splitParamNames(key: string): [string, string[]] {
    const [newKey, ...paramNames] = key.split(':');
    return [newKey, paramNames];
  }

  /**
   * Finds every interpolation placeholder (`{{ ... }}`) in the given text.
   *
   * @param selection The text to scan.
   * @returns An array of regex matches, one per placeholder found.
   */
  public static checkForParamsInSelection(selection: string): RegExpMatchArray[] {
    const paramTest = new RegExp(/{{.*?}}/, 'g');
    const params = [...selection.matchAll(paramTest)];
    return params;
  }

  /**
   * Renames the interpolation placeholders in the selection using the provided
   * names, matched by position. Placeholders without a corresponding name are
   * left unchanged.
   *
   * @param selection The text containing `{{ ... }}` placeholders.
   * @param paramNames The new names, applied in order of appearance.
   * @returns The text with placeholders renamed.
   */
  public static renameParams(selection: string, paramNames: string[]): string {
    const params = ExtensionUtils.checkForParamsInSelection(selection);
    params.forEach((param, id) => {
      if (paramNames[id]) {
        selection = selection.replace(param[0], ` {{ ${paramNames[id]} }} `);
      }
    });
    return selection;
  }

  /**
   * Builds a full key in `scope` mode by appending a slug derived from the
   * selected text to the scope. Special characters are stripped, spaces become
   * underscores and repeated underscores are collapsed. When the scope already
   * ends with a dot, it is returned as-is (without the trailing dot).
   *
   * @param key The scope entered by the user.
   * @param value The selected text used to generate the slug.
   * @returns The generated `scope.slug` key.
   */
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

  /**
   * Replaces the selection range in the active editor with the generated
   * snippet. In TypeScript, surrounding quotes from the original selection are
   * preserved around the inserted key.
   *
   * @param key The translation key to reference.
   * @param languageId The language of the edited document.
   * @param range The range to replace.
   * @param paramsMap Map of translation param names to their source expressions.
   */
  public static insertSnippet(key: string, languageId: string, range: vscode.Range, paramsMap: {[key:string]: string}) {
    const snippet = ExtensionUtils.prepareSnippet(key, languageId, paramsMap);
    if (languageId === 'typescript') {
      const selection = vscode.window.activeTextEditor?.document.getText(range);
      let snippetString = snippet.value;
      if (selection?.startsWith(`'`) || selection?.startsWith(`"`)) {
        snippetString = `'${snippetString}`;
      }
      if (selection?.endsWith(`'`) || selection?.endsWith(`"`)) {
        snippetString = `${snippetString}'`;
      }
      snippet.value = snippetString;
    }
    vscode.window.activeTextEditor?.insertSnippet(snippet, range);
  }

}