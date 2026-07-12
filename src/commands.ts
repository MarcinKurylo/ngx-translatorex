import * as vscode from 'vscode';
import { ExtensionCommands, EXTENSION_IDENTIFIER, MISSING_TRANSLATION_PLACEHOLDER } from './const';
import { NotificationManager } from './utils/notificationManager';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { ExtensionUtils } from './utils/extensionUtils';
import {
  LanguageReport,
  Mode,
  buildTranslationReport,
  checkForParamsInSelection,
  generateKey,
  isKeyValid,
  renameParams,
  sortObject,
  splitParamNames
} from './utils/translationUtils';

export class Commands {

  /**
   * Registers the command that prompts for the main i18n language code and
   * stores it (validated as a two-letter code) in the extension settings.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerSetLanguage(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SET_LANGUAGE}`, () => {
      vscode.window.showInputBox({ title: 'Set language' }).then((lang) => {
        if (!lang || !/^[a-zA-Z]{2}$/.test(lang)) {
          NotificationManager.showErrorMessage('Provide proper i18n code');
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
      vscode.window.showInputBox({ title: 'Set path to i18n folder', prompt: 'Can be absolute or pattern (e.g. **/assets/i18n)' }).then((path) => {
        if (!path) {
          NotificationManager.showErrorMessage('Provide path');
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
      vscode.window.showQuickPick(['key', 'scope']).then((mode) => {
        if (!mode) {
          NotificationManager.showErrorMessage('Invalid mode!');
        } else {
          ExtensionConfigManager.updateConfigValue('mode', mode);
        }
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
      if (!selection) {
        return NotificationManager.showErrorMessage('No text selected');
      }

      const mode = (ExtensionConfigManager.getConfigValue('mode') ?? 'key') as Mode;
      const input = await vscode.window.showInputBox({
        title: mode === 'key' ? 'Set key' : 'Set scope',
        prompt: "Can be nested (e.g. 'key1.key2)"
      });
      const [rawKey, paramNames] = splitParamNames(input ?? '');
      if (!input || !isKeyValid(input, mode) || !isKeyValid(rawKey, mode)) {
        return NotificationManager.showErrorMessage('Invalid key');
      }

      const originalParams = checkForParamsInSelection(selection.text);
      let value = renameParams(selection.text, paramNames);
      if (selection.languageId === 'typescript') {
        value = value.replace(/(^"|^'|"$|'$)/g, '');
      }
      const paramsMap = Commands.buildParamsMap(originalParams, checkForParamsInSelection(value));
      const key = mode === 'key' ? rawKey : generateKey(rawKey, value);

      const { saved, overwritten } = await FileSystemManager.addTranslation(key, value);
      if (!saved) {
        return;
      }
      if (overwritten) {
        NotificationManager.showInfoMessage('Existing i18n key overwritten with new value!');
      }
      FileSystemManager.cache[key] = value;
      FileSystemManager.onCacheChanged?.();
      ExtensionUtils.insertSnippet(key, selection.languageId, selection.range, paramsMap);
    });
  }

  /**
   * Registers the command backing the "Create i18n key" diagnostic quick fix:
   * it prompts for the main-language value and writes the key across all
   * language files, then updates the cache so the missing-key warning clears.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerCreateTranslationKey(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.CREATE_TRANSLATION_KEY}`, async (key?: string) => {
      if (!key) {
        return;
      }
      const value = await vscode.window.showInputBox({
        title: `Create i18n key '${key}'`,
        prompt: 'Value for the main language'
      });
      if (value === undefined) {
        return;
      }
      const { saved } = await FileSystemManager.addTranslation(key, value);
      if (!saved) {
        return;
      }
      FileSystemManager.cache[key] = value;
      FileSystemManager.onCacheChanged?.();
      NotificationManager.showInfoMessage(`i18n key '${key}' created`);
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
      const translations = await FileSystemManager.fetchJson();
      await FileSystemManager.saveJson(sortObject(translations));
    });
  }

  /**
   * Registers the command that reports, per language, which keys are missing or
   * still hold the placeholder value across the i18n folder, rendering the
   * result as a Markdown document.
   *
   * @returns The command disposable, to be added to the extension subscriptions.
   */
  public static registerShowTranslationReport(): vscode.Disposable {
    return vscode.commands.registerCommand(`${EXTENSION_IDENTIFIER}.${ExtensionCommands.SHOW_TRANSLATION_REPORT}`, async () => {
      const languages = await FileSystemManager.getAllLanguageTranslations();
      if (!languages.length) {
        return NotificationManager.showErrorMessage('No i18n language files found');
      }
      const reports = buildTranslationReport(languages, MISSING_TRANSLATION_PLACEHOLDER);
      const doc = await vscode.workspace.openTextDocument({
        content: Commands.renderReport(reports),
        language: 'markdown'
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    });
  }

  /** Renders the per-language translation report as a Markdown document. */
  private static renderReport(reports: LanguageReport[]): string {
    const lines: string[] = ['# Translation report', ''];
    for (const report of reports) {
      lines.push(`## ${report.language}`, '');
      if (!report.missing.length && !report.untranslated.length) {
        lines.push('✅ Fully translated', '');
        continue;
      }
      if (report.missing.length) {
        lines.push(`### Missing keys (${report.missing.length})`, '');
        report.missing.forEach((key) => lines.push(`- \`${key}\``));
        lines.push('');
      }
      if (report.untranslated.length) {
        lines.push(`### Untranslated placeholders (${report.untranslated.length})`, '');
        report.untranslated.forEach((key) => lines.push(`- \`${key}\``));
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  /**
   * Maps each (renamed) selection placeholder to the original placeholder it
   * replaced, by position, so the inserted snippet can bind params to their
   * source expressions.
   */
  private static buildParamsMap(
    originalParams: RegExpMatchArray[],
    renamedParams: RegExpMatchArray[]
  ): { [key: string]: string } {
    const clean = (param: RegExpMatchArray) => param[0].replace('{{', '').replace('}}', '').trim();
    const map: { [key: string]: string } = {};
    renamedParams.forEach((param, id) => {
      if (originalParams[id]) {
        map[clean(param)] = clean(originalParams[id]);
      }
    });
    return map;
  }
}
