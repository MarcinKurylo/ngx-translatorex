# ngx-translatorex

Turn hard-coded strings in your Angular app into [ngx-translate](https://github.com/ngx-translate/core) keys without leaving the editor. Select some text, press a shortcut, and ngx-translatorex writes the translation to your i18n file and replaces the selection with the matching `translate` pipe or key — interpolation params included.

## Features

- **One-shortcut extraction** — select text in an `.html` or `.ts` file, press `Ctrl+T` / `Cmd+T`, and the string is moved to your i18n JSON under the key you type.
- **Multi-language sync** — the new key is added to every language file in your i18n folder at once: the real value goes into your main language, and the others get a `[TODO] translation not implemented` placeholder so nothing is silently missing. Existing translations in other languages are never overwritten.
- **Key and scope modes** — type the full key yourself, or let the extension generate one from the selected text under a scope you choose.
- **Interpolation params** — `{{ ... }}` placeholders in the selection are detected, can be renamed inline, and are wired into the generated `translate` pipe.
- **Inline translation tooltips** — hover a key in your templates to see its translated value.
- **IntelliSense completions** — get autocomplete for existing translation keys as you type.
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

## Commands

| Command | Description |
| --- | --- |
| `ngx-translatorex.addNewTranslation` | Add a translation for the selected text (`Ctrl+T` / `Cmd+T`). |
| `ngx-translatorex.setLanguage` | Set the main i18n `.json` file. |
| `ngx-translatorex.setPath` | Set the path to the i18n folder. |
| `ngx-translatorex.setMode` | Switch between key and scope mode. |
| `ngx-translatorex.sortJson` | Alphabetically sort the i18n file. |

## Requirements

An open Angular project with at least one i18n `.json` file.

## License

[MIT](LICENSE)
