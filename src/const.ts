export const EXTENSION_IDENTIFIER = 'ngx-translatorex';
export type ConfigValue = 'language' | 'mode' | 'path';

/**
 * Placeholder written for a new key into every language file other than the
 * main one, so the key exists everywhere and untranslated languages are easy
 * to spot.
 */
export const MISSING_TRANSLATION_PLACEHOLDER = '[TODO] translation not implemented';
/* eslint-disable @typescript-eslint/naming-convention */
export enum ExtensionCommands  {
  SET_LANGUAGE = 'setLanguage',
  SET_PATH = 'setPath',
  SET_MODE = 'setMode',
  ADD_NEW_TRANSLATION = 'addNewTranslation',
  SORT_JSON = 'sortJson',
  CREATE_TRANSLATION_KEY = 'createTranslationKey',
  SHOW_TRANSLATION_REPORT = 'showTranslationReport',
  RENAME_TRANSLATION_KEY = 'renameTranslationKey',
  DELETE_TRANSLATION_KEY = 'deleteTranslationKey'
}