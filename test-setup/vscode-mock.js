// Minimal stub of the `vscode` module for unit tests running in plain Node
// (outside the Extension Development Host). It is enough for the utils modules
// to load without errors; tests drive the config via a global.
const configStore = {
  'ngx-translatorex': { language: 'en', path: '**/assets/i18n/', mode: 'key' }
};
global.__vscodeConfigStore = configStore;

module.exports = {
  Range: class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  },
  SnippetString: class SnippetString {
    constructor(value) { this.value = value; }
  },
  Hover: class Hover {
    constructor(contents) { this.contents = contents; }
  },
  CompletionItemKind: { Snippet: 27 },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: () => {},
    showErrorMessage: () => {},
    showInputBox: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined)
  },
  workspace: {
    getConfiguration: (section) => ({
      get: (key) => configStore[section] && configStore[section][key],
      update: () => Promise.resolve()
    }),
    findFiles: () => Promise.resolve([]),
    fs: {
      readFile: () => Promise.resolve(new Uint8Array()),
      writeFile: () => Promise.resolve()
    }
  },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    registerHoverProvider: () => ({ dispose() {} })
  },
  commands: { registerCommand: () => ({ dispose() {} }) }
};
