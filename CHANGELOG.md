# Change Log

All notable changes to the "ngx-translatorex" extension will be documented in this file.

## [Unreleased]

- Hard-coded string detection (experimental, opt-in via
  `ngx-translatorex.detectHardcodedStrings`): flags untranslated user-facing
  text and `title`/`placeholder`/`aria-label`/`alt`/`matTooltip` values in HTML
  templates as Information hints, with **Extract to i18n key** and **Ignore this
  string** quick fixes. Text mixing static words with interpolations
  ("Hello {{ name }}") is captured whole so extraction can bind its params,
  while pure numbers/symbols, version tokens, single characters and code-like
  tokens (URLs, paths, `snake_case`/`camelCase`/dotted identifiers) are skipped.
  Ignore via the `hardcodedStringsIgnore` list (supports `*` wildcards) or an
  inline `<!-- i18n-ignore -->` marker.
- Workspace hard-coded strings scan: the **Scan workspace for hard-coded
  strings** command scans every HTML template (excluding `node_modules`, `dist`,
  `.angular`, `out`, `coverage`) and opens a Markdown report grouped by file with
  line numbers. Runs under a cancellable progress notification with
  bounded-concurrency file reads, so it stays responsive on large projects, and
  works regardless of the live opt-in setting.

## [0.3.0]

- Go-to-definition: F12 or Ctrl/Cmd+Click on a key used with the `translate`
  pipe (HTML) or `TranslateService` (TypeScript) jumps to that key's line in the
  main language JSON file.
- Rename i18n key: rename a key (leaf or whole namespace) and propagate the
  change to every language file, moving each file's own value.
- Delete i18n key: delete a key from every language file, pruning any objects
  left empty by the removal.
- Settings: `placeholder` (customise the untranslated-key placeholder),
  `diagnostics` (toggle missing-key warnings off in projects with many dynamic
  keys), and `syncLanguages` (toggle writing placeholders into other language
  files when adding a key).
- Fix the extension icon (the serif `t` now renders correctly) and replace the
  retired Marketplace badges in the README. This is the first release to ship
  the corrected icon.

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
- Report missing i18n keys as diagnostics: keys used with the `translate` pipe
  (HTML) or `TranslateService` `.instant`/`.get`/`.stream` calls (TypeScript)
  that are absent from the i18n file are underlined as warnings, with a
  "Create i18n key" quick fix that adds them across all languages.
- Add a **Show translation report** command that lists, per language, the keys
  that are missing or still hold the `[TODO]` placeholder across the i18n folder.