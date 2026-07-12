# Change Log

All notable changes to the "ngx-translatorex" extension will be documented in this file.

## [0.0.1]

- Initial release

## [0.0.2]

- Fix bug with missing quotation marks in HTML completion
- Improve quotation marks handling in TS

## [0.1.0]

- Add automatic cache refresh: the extension now watches the configured i18n
  file and reloads translations when it changes outside the editor (manual
  edits, a git pull or branch switch) or when the language/path settings change
- Modernize tooling: TypeScript 5.9, ESLint 9 flat config, Node 20, updated
  dependencies with no remaining `npm audit` vulnerabilities, and a CI workflow
- Add unit tests for the translation core and end-to-end integration tests that
  run against a real VS Code host
- Refactor the translation logic into a pure, VS Code-independent module

## [0.1.1]

- Add an extension icon
- Separate the Marketplace listing README from the GitHub developer README
- Align the gallery banner colour with the icon

## [0.2.0]

- Sync new keys across all language files in the i18n folder: the main language
  gets the entered value, while every other language gets a
  `[TODO] translation not implemented` placeholder. Existing translations in
  other languages are never overwritten.