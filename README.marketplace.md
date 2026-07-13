# ngx-translatorex

Turn hard-coded strings in your Angular app into [ngx-translate](https://github.com/ngx-translate/core) keys without leaving the editor. Select some text, press a shortcut, and ngx-translatorex writes the translation to your i18n file and replaces the selection with the matching `translate` pipe or key — interpolation params included.

## Features

- **One-shortcut extraction** — select text in an `.html` or `.ts` file, press `Ctrl+T` / `Cmd+T`, and the string is moved to your i18n JSON under the key you type.
- **Multi-language sync** — the new key is added to every language file in your i18n folder at once: the real value goes into your main language, and the others get a `[TODO] translation not implemented` placeholder so nothing is silently missing. Existing translations in other languages are never overwritten.
- **Key and scope modes** — type the full key yourself, or let the extension generate one from the selected text under a scope you choose.
- **Interpolation params** — `{{ ... }}` placeholders in the selection are detected, can be renamed inline, and are wired into the generated `translate` pipe.
- **Inline translation tooltips** — hover a key in your templates to see its translated value.
- **IntelliSense completions** — get autocomplete for existing translation keys as you type.
- **Missing-key diagnostics** — keys used with the `translate` pipe or `TranslateService` (`.instant`/`.get`/`.stream`) that don't exist in your i18n file are underlined as warnings, with a **Create i18n key** quick fix that adds them across all languages.
- **Go-to-definition** — press `F12` or `Ctrl`/`Cmd`+Click on a key used with the `translate` pipe or `TranslateService` to jump straight to that key's line in your main language JSON.
- **Rename / delete keys** — rename or delete a key (a single leaf or a whole namespace) and the change propagates across every language file, each keeping its own value.
- **Translation report** — run **Show translation report** for a per-language summary of keys that are missing or still hold the placeholder, so you always know what's left to translate.
- **Hard-coded string detection (experimental, opt-in)** — flags untranslated user-facing text and `title`/`placeholder`/`aria-label`/`alt`/`matTooltip` values in templates as hints, with **Extract to i18n key** and **Ignore this string** quick fixes. Run **Scan workspace for hard-coded strings** for a project-wide report grouped by file. Enable with `ngx-translatorex.detectHardcodedStrings`.
- **AI auto-translation** — run **Auto-translate missing placeholders** to fill every `[TODO]` placeholder using your own VS Code language model (e.g. GitHub Copilot) — no external translation service, no API key. Interpolation `{{ params }}` are preserved, and any translation that would drop them is skipped. Requires VS Code 1.90+ with a language model provider.
- **One-command extract pipeline** — run **Extract all hard-coded strings in this template** to turn every hard-coded string in the current HTML file into i18n keys under a scope you pick, rewrite the template in one undoable edit, and optionally auto-translate the new placeholders right after.
- **AI agent tools** — with an agent (e.g. Copilot's agent mode), the extension provides tools to scan for hard-coded strings, extract them into keys it names semantically (`page.title`, `actions.save`), list what's still missing, and write translations — so you can ask the agent to run the whole scan → extract → translate flow for you. Requires VS Code 1.95+ and a language model provider.
- **Automatic refresh** — the extension watches your i18n file and reloads translations when it changes outside the editor (a manual edit, a `git pull`, or a branch switch), so tooltips and completions stay accurate.
- **One-click JSON sort** — alphabetically sort your translation file, recursively.

## Getting started

1. Open an Angular project that has at least one i18n `.json` file (e.g. `src/assets/i18n/en.json`).
2. Point the extension at it if it isn't auto-detected — run **ngx-translatorex: Set path to i18n folder** and **Set main i18n json file**.
3. In an `.html` or `.ts` file, **select the text** you want to translate.
4. Press **`Ctrl+T`** (**`Cmd+T`** on macOS) and enter a key.

That's it — the value lands in your i18n file and the selection is replaced with the translation reference.

### Key mode vs scope mode

- **Key mode** (default): what you type is used verbatim as the key. `home.header.title` → `home.header.title`.
- **Scope mode**: what you type is a *scope*, and the key is generated from the selected text. Scope `label` + selection `My text` → `label.my_text: "My text"`. To skip auto-generation for a single entry, end the scope with a dot: `label.renamed.` + `My text` → `label.renamed: "My text"`.

Switch modes any time with **ngx-translatorex: Set extension mode**.

### Params

If your selection contains interpolation placeholders, they are extracted and can be renamed by appending names to the key, separated by colons — e.g. entering `greeting.hello:name` renames the first `{{ ... }}` to `{{ name }}` and binds it in the generated pipe.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| `ngx-translatorex.mode` | Mode in which the extension works — `key` or `scope`. | `key` |
| `ngx-translatorex.language` | Main i18n file to write to (e.g. `en`). | `en` |
| `ngx-translatorex.path` | Full path or glob to the i18n folder. | `**/assets/i18n/` |
| `ngx-translatorex.placeholder` | Placeholder written into other language files for a new key until it's translated (also flags untranslated keys in the report). | `[TODO] translation not implemented` |
| `ngx-translatorex.diagnostics` | Underline keys that are missing from the i18n files as warnings. Turn off in projects with many dynamic keys. | `true` |
| `ngx-translatorex.syncLanguages` | When adding a key, also write a placeholder into every other language file so the key exists everywhere. | `true` |
| `ngx-translatorex.detectHardcodedStrings` | Experimental, opt-in: flag hard-coded strings in HTML templates as hints. | `false` |
| `ngx-translatorex.hardcodedStringsMinLength` | Minimum length of a hard-coded string to flag. | `2` |
| `ngx-translatorex.hardcodedStringsIgnore` | Strings to never flag (supports `*` wildcards). | `[]` |

## Commands

| Command | Description |
| --- | --- |
| `ngx-translatorex.addNewTranslation` | Add a translation for the selected text (`Ctrl+T` / `Cmd+T`). |
| `ngx-translatorex.setLanguage` | Set the main i18n `.json` file. |
| `ngx-translatorex.setPath` | Set the path to the i18n folder. |
| `ngx-translatorex.setMode` | Switch between key and scope mode. |
| `ngx-translatorex.sortJson` | Alphabetically sort the i18n file. |
| `ngx-translatorex.showTranslationReport` | Show a per-language report of missing and untranslated keys. |
| `ngx-translatorex.renameTranslationKey` | Rename a key across all language files. |
| `ngx-translatorex.deleteTranslationKey` | Delete a key across all language files. |
| `ngx-translatorex.showHardcodedStringsReport` | Scan every HTML template in the workspace for hard-coded strings. |
| `ngx-translatorex.translatePlaceholders` | Auto-translate missing placeholders with your language model. |
| `ngx-translatorex.extractTemplateStrings` | Extract all hard-coded strings in the active template into i18n keys. |

## Requirements

An open Angular project with at least one i18n `.json` file.

## License

[MIT](LICENSE)
