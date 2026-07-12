import * as vscode from 'vscode';
import { FileSystemManager } from './utils/fileSytemManager';
export class HoverProviders {

  /**
   * Registers an HTML hover provider that, when hovering over a
   * `{{ 'key' | translate }}` expression, shows the key together with its
   * translation from the cache (or a notice when the key has no value).
   *
   * @returns The provider disposable, to be added to the extension subscriptions.
   */
  public static registerHtmlHoverProvider() {
    return vscode.languages.registerHoverProvider('html', {
      provideHover(document, position, _token) {
        const line = position.line;
        const range = document.lineAt(line).range;
        const text = document.getText(range);
        const translateTest = new RegExp(/{{.*?'([A-Za-z0-9_\\.]+)'.*?\|.*?translate.*?}}/, 'g');
        const matches = [...text.matchAll(translateTest)];
        let hoveredMatch;
        for (const match of matches) {
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;
          if (matchStart <= position.character && matchEnd >= position.character) {
            hoveredMatch = match[1];
            break;
          }
        }
        if (hoveredMatch) {
          return new vscode.Hover(`${hoveredMatch}: ${FileSystemManager.cache[hoveredMatch] ??' No value for this key!'}`);
        }
      }
    });
  }
}