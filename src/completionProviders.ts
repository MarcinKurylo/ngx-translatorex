import { ExtensionUtils } from "./utils/extensionUtils";
import { FileSystemManager } from "./utils/fileSytemManager";
import * as vscode from 'vscode';

export class CompletionProviders {

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
          params.forEach(param => {
            snippet += `${param[0].replace('{{','').replace('}}','')}:'PLACEHOLDER'`;
          });
          snippet += ' } }}';
          return snippet;
        };
        return { ...item, insertText: resolveInsertText()};
      }
    });
  }
}