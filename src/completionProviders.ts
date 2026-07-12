import { ExtensionUtils } from './utils/extensionUtils';
import { FileSystemManager } from './utils/fileSystemManager';
import * as vscode from 'vscode';

export class CompletionProviders {

  /**
   * Registers an HTML completion provider that suggests every cached
   * translation key (prefixed with `t.`). On resolve, the selected item is
   * expanded into a `{{ 'key' | translate }}` snippet, including a params
   * object with placeholders when the translation contains interpolations.
   *
   * @returns The provider disposable, to be added to the extension subscriptions.
   */
  public static registerCompletionProvider() {
    return vscode.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: () => {
        const completionItems: vscode.CompletionItem[] = [];
        for (const key in FileSystemManager.cache) {
          completionItems.push({label: `t.${key}`, kind: vscode.CompletionItemKind.Snippet, detail: FileSystemManager.cache[key] });
        }
        return completionItems;
      },
      resolveCompletionItem: (item) => {
        const resolveInsertText = () => {
          let snippet = `{{ '${item.label.toString().slice(2)}' | translate`;
          const params = ExtensionUtils.checkForParamsInSelection(FileSystemManager.cache[item.label.toString().slice(2)]);
          if (!params.length) {
            return `${snippet} }}`;
          }
          snippet += ': { ' ;
          snippet += params
            .map(param => `${param[0].replace('{{', '').replace('}}', '').trim()}:'PLACEHOLDER'`)
            .join(', ');
          snippet += ' } }}';
          return snippet;
        };
        return { ...item, insertText: resolveInsertText()};
      }
    });
  }
}