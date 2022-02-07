export const EXTENSION_IDENTIFIER = 'ngx-translatorex';
export type ConfigValue = 'language' | 'mode' | 'path';
/* eslint-disable @typescript-eslint/naming-convention */
export enum ExtensionCommands  {
  SET_LANGUAGE = 'setLanguage',
  SET_PATH = 'setPath',
  SET_MODE = 'setMode',
  ADD_NEW_TRANSLATION = 'addNewTranslation',
  SORT_JSON = 'sortJson'
}