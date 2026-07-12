import * as vscode from 'vscode';
import { Selection } from '../models';

/**
 * Editor-facing helpers that depend on the `vscode` API. Pure translation-tree
 * logic lives in `translationUtils.ts` so it can be unit-tested without stubs.
 */
export class ExtensionUtils {

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
    switch (languageId) {
      case 'typescript':
        return new vscode.SnippetString(`${key}`);
      case 'html': {
        let snippetText = `{{ '${key}' | translate }}`;
        if (Object.keys(paramsMap).length) {
          snippetText = `${snippetText.split(' }}')[0]}:{`;
          for (const paramName in paramsMap) {
            snippetText += ` ${paramName}:${paramsMap[paramName]}`;
          }
          snippetText += '} }}';
        }
        return new vscode.SnippetString(snippetText);
      }
      default:
        throw new Error(`Unsupported languageId for snippet generation: ${languageId}`);
    }
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
