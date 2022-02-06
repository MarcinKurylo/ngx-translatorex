import * as vscode from 'vscode';
import { Utils } from './utils';
export class Commands {

  public static setLanguage(): vscode.Disposable {
    return vscode.commands.registerCommand('ngx-translatorex.setLanguage', () => {
      vscode.window.showInputBox({title: 'Set language'}).then((lang) => {
        const i18nTest = new RegExp(/^[a-zA-Z]{2}$/);
        if (!lang || !i18nTest.test(lang)) {
          Utils.showErrorMessage("Provide proper i18n code");
        } else {
          Utils.updateConfigValue('language', lang.toLocaleLowerCase());
          Utils.showInfoMessage(`Main language set to ${lang.toLocaleLowerCase()}`);
        }
      });
    });
  }

  public static setPath(): vscode.Disposable {
    return vscode.commands.registerCommand('ngx-translatorex.setPath', () => {
      vscode.window.showInputBox({title: 'Set path to vscode i18n', prompt: 'Can be absolute or pattern (e.g. **/assets/i18n)'}).then(path => {
        if (!path) {
          Utils.showErrorMessage("Provide path");
        } else {
          path = path.endsWith('/') ? path : `${path}/`;
          Utils.updateConfigValue('path', path.toLocaleLowerCase());
          Utils.showInfoMessage(`i18n path set to ${path.toLocaleLowerCase()}`);
        }
      });
    });
  }

  public static addNewTranslation(): vscode.Disposable {
    return vscode.commands.registerCommand('ngx-translatorex.addNewTranslation', async () => {
      const selection = Utils.getSelection();
      if (selection) {
        vscode.window.showInputBox({title: 'Set key', prompt: "Can be nested (e.g. 'key1.key2)"}).then(async key => {
          if (!key) {
            return Utils.showErrorMessage("Invalid key");
          }
          const translationsJson = await Utils.fetchJson();
          Utils.setKey(key, translationsJson, selection);
          Utils.saveJson(translationsJson);
        });
      } else {
        Utils.showErrorMessage("No text selected");
      }
    });
  }

  public static sortJson(): vscode.Disposable {
    return vscode.commands.registerCommand('ngx-translatorex.sortJson', async () => {
      const translationsJson = (await Utils.fetchJson());
      const sortedJson = Utils.sortJson(translationsJson);
      Utils.saveJson(sortedJson);
    });
  }
}