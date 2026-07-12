# ngx-translatorex

[![CI](https://github.com/MarcinKurylo/ngx-translatorex/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcinKurylo/ngx-translatorex/actions/workflows/ci.yml)
[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/marcinex.ngx-translatorex?label=marketplace)](https://marketplace.visualstudio.com/items?itemName=marcinex.ngx-translatorex)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/marcinex.ngx-translatorex)](https://marketplace.visualstudio.com/items?itemName=marcinex.ngx-translatorex)
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
- `key` and `scope` modes (type the key, or auto-generate it from the selection).
- Interpolation param detection, inline rename and binding into the `translate` pipe.
- Hover tooltips showing a key's translated value.
- IntelliSense completions for existing keys.
- Automatic cache refresh via a file watcher when the i18n file changes outside the editor.
- One-click recursive JSON sort.

See [`README.marketplace.md`](README.marketplace.md) for the full usage guide,
settings and commands.

## Architecture

- `src/utils/translationUtils.ts` — pure, `vscode`-free translation-tree logic
  (validation, nesting, flatten, sort, key generation). Unit-tested directly.
- `src/utils/*` — editor-facing helpers (selection, snippets, config, file I/O,
  the i18n file watcher, notifications).
- `src/commands.ts`, `src/hoverProviders.ts`, `src/completionProviders.ts` —
  the contributed commands and providers.
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
