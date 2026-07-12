import * as vscode from 'vscode';
import { ExtensionCommands, EXTENSION_IDENTIFIER } from './const';
import { NotificationManager } from './utils/notificationManager';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { ExtensionUtils } from './utils/extensionUtils';
export class Commands {

  /**
   * Registers the command that prompts for the main i18n language code and
   * stores it (validated as a two-letter code) in the extension settings.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerSetLanguage(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SET_LANGUAGE}`, () => {
      vscode.window.showInputBox({title: 'Set language'}).then((lang) => {
        const i18nTest = new RegExp(/^[a-zA-Z]{2}$/);
        if (!lang || !i18nTest.test(lang)) {
          NotificationManager.showErrorMessage("Provide proper i18n code");
        } else {
          ExtensionConfigManager.updateConfigValue('language', lang.toLocaleLowerCase());
          NotificationManager.showInfoMessage(`Main language set to ${lang.toLocaleLowerCase()}`);
        }
      });
    });
  }

  /**
   * Registers the command that prompts for the i18n folder path (absolute or a
   * glob pattern) and stores it in the extension settings, ensuring a trailing slash.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerSetPath(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SET_PATH}`, () => {
      vscode.window.showInputBox({title: 'Set path to i18n folder', prompt: 'Can be absolute or pattern (e.g. **/assets/i18n)'}).then(path => {
        if (!path) {
          NotificationManager.showErrorMessage("Provide path");
        } else {
          path = path.endsWith('/') ? path : `${path}/`;
          ExtensionConfigManager.updateConfigValue('path', path);
          NotificationManager.showInfoMessage(`i18n path set to ${path}`);
        }
      });
    });
  }

  /**
   * Registers the command that lets the user pick the extension mode
   * (`key` or `scope`) and stores it in the settings.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerSetMode(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SET_MODE}`, () => {
      vscode.window.showQuickPick(['key', 'scope']).then(mode => {
        if (!mode) {
          NotificationManager.showErrorMessage("Invalid mode!");
        } else {
          ExtensionConfigManager.updateConfigValue('mode', mode);
        };
      });
    });
  }

  /**
   * Registers the core command that turns the current selection into a
   * translation entry: it prompts for a key (or scope), extracts and optionally
   * renames interpolation params, writes the value to the i18n file, updates the
   * cache and replaces the selection with the matching translate snippet.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerAddNewTranslation(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.ADD_NEW_TRANSLATION}`, async () => {
      const selection = ExtensionUtils.getSelection();
      if (selection) {
        const mode = ExtensionConfigManager.getConfigValue('mode')!;
        const title = mode  === 'key' ? 'Set key' : 'Set scope';
        vscode.window.showInputBox({title, prompt: "Can be nested (e.g. 'key1.key2)"}).then(async key => {
          if (!key || !ExtensionUtils.checkIfKeyValid(key)) {
            return NotificationManager.showErrorMessage("Invalid key");
          }
          let paramNames: string[];
          [key, paramNames] = ExtensionUtils.splitParamNames(key);
          if (!ExtensionUtils.checkIfKeyValid(key)) {
            return NotificationManager.showErrorMessage("Invalid key");
          }
          const params = ExtensionUtils.checkForParamsInSelection(selection.text);
          selection.text = ExtensionUtils.renameParams(selection.text, paramNames);
          if (selection.languageId === 'typescript') {
            selection.text = selection.text.replace(/(^"|^'|"$|'$)/g, '');
          }
          const paramsRenamed = ExtensionUtils.checkForParamsInSelection(selection.text);
          const paramsMap: {[key:string]: string} = {};
          paramsRenamed.forEach((param, id) => {
            paramsMap[param[0].replace("{{", "").replace("}}", '').trim()] = params[id][0].replace("{{", "").replace("}}", '').trim();
          });
          key = mode === 'key' ? key : ExtensionUtils.generateKey(key, selection.text);
          const translationsJson = await FileSystemManager.fetchJson();
          ExtensionUtils.setKey(key, translationsJson, selection.text);
          ExtensionUtils.insertSnippet(key, selection.languageId, selection.range, paramsMap);
          FileSystemManager.cache[key] = selection.text;
          FileSystemManager.saveJson(translationsJson);
        });
      } else {
        NotificationManager.showErrorMessage("No text selected");
      }
    });
  }

  /**
   * Registers the command that alphabetically sorts the main i18n JSON file
   * (recursively) and writes it back.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerSortJson(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SORT_JSON}`, async () => {
      const translationsJson = (await FileSystemManager.fetchJson());
      const sortedJson = ExtensionUtils.sortObject(translationsJson);
      FileSystemManager.saveJson(sortedJson);
    });
  }
}