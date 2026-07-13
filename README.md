# ngx-translatorex

[![CI](https://github.com/MarcinKurylo/ngx-translatorex/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcinKurylo/ngx-translatorex/actions/workflows/ci.yml)
[![Marketplace Version](https://vsmarketplacebadges.dev/version-short/marcinex.ngx-translatorex.svg?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=marcinex.ngx-translatorex)
[![Installs](https://vsmarketplacebadges.dev/installs-short/marcinex.ngx-translatorex.svg)](https://marketplace.visualstudio.com/items?itemName=marcinex.ngx-translatorex)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A VS Code extension that extracts hard-coded strings from Angular templates and
components into [ngx-translate](https://github.com/ngx-translate/core) i18n keys.
Select text, press `Ctrl+T` / `Cmd+T`, and the string is written to your i18n
JSON while the selection is replaced with the matching `translate` pipe or key.

> **Installing?** Grab it from the
> [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=marcinex.ngx-translatorex).
> The user-facing guide lives in [`README.marketplace.md`](README.marketplace.md),
> which is what the Marketplace listing renders. This file is the developer
> readme.

## Features

- One-shortcut extraction of strings from `.html` and `.ts` into i18n keys.
- Multi-language sync: the key is written to every language file in the i18n folder — the real value into the main language, a placeholder into the rest (existing values are never overwritten).
- `key` and `scope` modes (type the key, or auto-generate it from the selection).
- Interpolation param detection, inline rename and binding into the `translate` pipe.
- Inline translation preview: a key's value shown greyed after the key in templates/components.
- Hover tooltips showing a key's translated value.
- IntelliSense completions for existing keys.
- Missing-key diagnostics for `translate` pipe / `TranslateService` usages, with a "Create i18n key" quick fix.
- Go-to-definition (F12 / Ctrl+Click) on a `translate` key jumps to its line in the main language JSON.
- Rename or delete a key with propagation across every language file.
- Configurable settings: placeholder text, diagnostics on/off, and multi-language sync on/off.
- Experimental, opt-in hard-coded-string detection in HTML templates (Information hints) with extract/ignore quick fixes.
- Workspace-wide hard-coded-strings scan (cancellable, bounded-concurrency) that reports every untranslated template string grouped by file.
- AI auto-translation of `[TODO]` placeholders via the VS Code Language Model API (your own model, no external service), preserving `{{ params }}`.
- One-command pipeline: extract every hard-coded string in a template into i18n keys (single undoable edit) and auto-translate the new placeholders.
- Agent tools (VS Code Language Model Tools) so an AI agent can drive the whole scan → extract → translate flow, choosing semantic key names itself.
- A standalone MCP server ([`mcp/`](mcp/README.md)) exposing the same operations to any MCP-capable agent (Claude Desktop, Claude Code, …).
- Per-language translation report (missing and untranslated keys across the i18n folder).
- Automatic cache refresh via a file watcher when the i18n file changes outside the editor.
- One-click recursive JSON sort.

See [`README.marketplace.md`](README.marketplace.md) for the full usage guide,
settings and commands.

## Architecture

- `src/utils/translationUtils.ts` — pure, `vscode`-free translation-tree logic
  (validation, nesting, flatten, sort, key generation). Unit-tested directly.
- `src/utils/*` — editor-facing helpers (selection, snippets, config, file I/O,
  the i18n file watcher, notifications).
- `src/commands.ts`, `src/hoverProviders.ts`, `src/completionProviders.ts`,
  `src/definitionProviders.ts`, `src/diagnosticsProvider.ts`,
  `src/hardcodedStringsProvider.ts`, `src/inlineTranslationDecorations.ts` — the
  contributed commands and providers (missing-key diagnostics, go-to-definition,
  the opt-in hard-coded-string hints with their extract/ignore quick fixes, and
  the inline translation-value previews).
- `src/utils/diagnosticsUtils.ts` — pure, `vscode`-free detection of
  translate-key references in HTML/TS. Unit-tested directly.
- `src/utils/hardcodedStringUtils.ts` — pure, `vscode`-free detection of
  hard-coded user-facing strings in HTML templates (the heuristic seam behind
  the opt-in hints). Unit-tested directly.
- `src/utils/translationLmUtils.ts` — pure, `vscode`-free prompt building and
  `{{ param }}` preservation/sanitising for AI auto-translation. Unit-tested
  directly.
- `src/utils/languageModelManager.ts` — thin wrapper over the VS Code Language
  Model API (`vscode.lm`): model selection and request streaming.
- `src/languageModelTools.ts` — registers the Language Model tools
  (`scanHardcodedStrings`, `extractString`, `listMissingTranslations`,
  `setTranslation`, `setTranslations`) that let an AI agent orchestrate the i18n
  flow; each is a thin, structured wrapper over the same engine the commands use.
- `mcp/` — a standalone Model Context Protocol server (separate package) that
  re-exposes the same operations to external agents over stdio, reusing the pure
  `src/utils` logic via a plain-`fs` file layer. Not part of the extension `.vsix`.
- `src/extension.ts` — activation: warms the cache, starts the watcher, wires up
  disposables.

## Development

```bash
npm install
npm run compile        # tsc
npm run lint           # eslint
npm run test:unit      # pure-logic unit tests (no VS Code host)
npm run test:e2e       # integration tests against a real VS Code instance
npm test               # unit + e2e
```

The e2e suite launches a real VS Code instance via `@vscode/test-electron`
against the fixture workspace in `src/test/fixtures/`. On Linux (including CI) it
needs a display, so it runs under `xvfb`.

### Packaging

```bash
npm run package        # builds a .vsix using README.marketplace.md as the readme
```

## Releasing

Releases are automated via GitHub Actions. To publish a new version:

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit to `main`, then tag the matching version and push it:
   `git tag v0.1.1 && git push origin v0.1.1`.

The `Release` workflow runs the tests, packages the extension (with the
Marketplace readme), publishes it to the VS Code Marketplace using the `VSCE_PAT`
repository secret, and attaches the `.vsix` to a GitHub Release. The tag name
should match the `package.json` version, which is the version actually published.

## License

[MIT](LICENSE)
