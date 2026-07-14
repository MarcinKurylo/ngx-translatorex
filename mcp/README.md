# ngx-translatorex MCP server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes ngx-translatorex's [ngx-translate](https://github.com/ngx-translate/core)
operations to **any** MCP-capable agent — Claude Desktop, Claude Code, or anything
else that speaks MCP. Point it at an Angular project and the agent can scan for
hard-coded strings, extract them into i18n keys, and fill in translations, all
through natural-language requests.

The division of labour is deliberate: the agent supplies the reasoning — semantic
key names, the actual translated text — while these tools do the deterministic,
repeatable file work (rewriting templates, keeping every language file in sync,
preserving interpolation params). The logic is the same pure code the VS Code
extension uses, so both surfaces behave identically.

The server ships separately from the extension `.vsix`; it exists to drive the
same workflow from an agent outside the editor.

## Tools

| Tool | Purpose |
| --- | --- |
| `scanHardcodedStrings` | Find hard-coded strings in HTML templates → `{ file, line, text, category, confidence }[]` |
| `extractStrings` | Batch: extract many strings at once; omit an item's `files` to apply the change to every template |
| `extractString` | Replace one string with a `translate` pipe and add its key across languages (interpolation is bound as params; reports `partial` when your text is only a fragment of a larger node) |
| `listMissingTranslations` | Keys missing/untranslated with their source. `summary` (default) returns counts + a per-prefix histogram; `summary:false` with `prefix`/`language`/`limit`/`offset` returns detail |
| `listUndefinedKeys` | Keys referenced in code but defined in no i18n file (dead references) |
| `setTranslations` | Write many translations at once (a value that drops a `{{ param }}` is skipped; `dryRun` previews) |
| `seedMissingTranslations` | Fill still-missing keys with the placeholder or a copy of the source (`copySource`); `dryRun` previews |

The server also exposes a **`localize-project` prompt** (via the MCP `prompts`
capability): a ready-made workflow that walks the agent through
scan → batch-extract → summary-first `listMissingTranslations` → batched
`setTranslations`. In Claude, pick it from the prompt/command menu to kick off a
full pass without writing the instructions yourself.

## Quick start

Published on npm as [`ngx-translatorex-mcp`](https://www.npmjs.com/package/ngx-translatorex-mcp),
so there is nothing to clone or build — the agent runs it via `npx`.

```bash
# 1. Register it with your agent, pointed at your project
claude mcp add ngx-translatorex \
  --env NGX_PROJECT_DIR=/abs/path/to/your/angular/project \
  -- npx -y ngx-translatorex-mcp
```

```text
# 2. Ask the agent (or run the localize-project prompt)
Localize this project: scan for hard-coded strings, extract them into sensible
i18n keys, then translate everything that's missing into every language.
```

> Currently published as a **preview** release. `npx -y ngx-translatorex-mcp`
> resolves it while it is the newest version; once a stable release exists, pin
> the channel with `ngx-translatorex-mcp@preview` if you specifically want
> prereleases. Prefer running from source? See [Build from source](#build-from-source).

## Configuration

The server is pointed at a project via environment variables. Only
`NGX_PROJECT_DIR` is usually needed; the rest have sensible defaults.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NGX_PROJECT_DIR` | cwd | Project root scanned for `.html` templates |
| `NGX_I18N_DIR` | `<root>/src/assets/i18n` | Folder holding `<lang>.json` files |
| `NGX_MAIN_LANG` | `en` | Main language code (the source of truth) |
| `NGX_PLACEHOLDER` | `[TODO] translation not implemented` | Untranslated-key placeholder |
| `NGX_SORT_ON_SAVE` | `false` | Set to `true` to alphabetically sort each i18n file on write |
| `NGX_HARDCODED_MIN_LENGTH` | `2` | Minimum trimmed length for a scanned hard-coded string |
| `NGX_HARDCODED_IGNORE` | (none) | Comma-separated literal/`*`-glob patterns to skip during the scan |

## Connecting your agent

### Claude Code

```bash
claude mcp add ngx-translatorex \
  --env NGX_PROJECT_DIR=/abs/path/to/your/angular/project \
  -- npx -y ngx-translatorex-mcp
```

Verify with `claude mcp list` (the server should report as connected), or ask
Claude to "list your ngx-translatorex tools".

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "ngx-translatorex": {
      "command": "npx",
      "args": ["-y", "ngx-translatorex-mcp"],
      "env": {
        "NGX_PROJECT_DIR": "/abs/path/to/your/angular/project",
        "NGX_MAIN_LANG": "en"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config; the server then appears under
the tools (plug) icon.

### Build from source

Prefer running from a checkout (contributing, or pinning to unreleased code)?
Build once — from the repo root, since the build pulls in `../src/utils`:

```bash
cd mcp && npm install && npm run build   # → dist/mcp/src/server.js
```

Then register `node /abs/path/to/ngx-translatorex/mcp/dist/mcp/src/server.js`
instead of the `npx` command above.

## Example prompts

The tools are named so the agent picks the right one from a plain request. A few
that map cleanly onto the workflow:

**Full pass (or just run the `localize-project` prompt):**
> Localize this project end to end — scan the templates for hard-coded strings,
> extract them into semantic keys (grouped by feature, e.g. `checkout.summary.total`),
> then translate everything missing into every language. Preserve interpolation params.

**Extract only, no translation yet:**
> Find the hard-coded strings in `src/app/checkout/` and extract them into i18n
> keys. Reuse one key for identical text, and put shared button labels under `actions.*`.

**Translate what's already keyed:**
> What's still untranslated? Give me the summary first, then translate the
> `checkout` keys into Polish and German and write them.

**Audit without changing anything:**
> Show me a summary of missing translations per language, and list any keys the
> code references that don't exist in the i18n files.

**Fill stubs for a new language:**
> I just added `es.json`. Seed it with copies of the English source so nothing is
> blank, then translate the `nav` and `common` keys.

Behind the scenes these route through `scanHardcodedStrings` → `extractStrings`
(batched) → `listMissingTranslations` (summary first, then filtered detail) →
`setTranslations` (batched). Claude Desktop and Claude Code prompt you before each
tool call by default, so writes are confirmed before they hit disk; any
translation that would drop a `{{ param }}` is rejected rather than written, and
`dryRun` lets the agent preview a write without touching files.

## Distributing without a registry (private dogfooding)

`npm pack` produces a self-contained tarball (the compiled `dist/` is bundled),
so you can run the server anywhere without publishing:

```bash
cd mcp && npm install && npm run build && npm pack   # → ngx-translatorex-mcp-<version>.tgz
```

Point a config at the tarball instead of a package name:

```json
{ "command": "npx", "args": ["-y", "/abs/path/to/ngx-translatorex-mcp-0.1.0.tgz"],
  "env": { "NGX_PROJECT_DIR": "/abs/path/to/project" } }
```

To share across macOS user profiles on the same machine, drop the tarball under
`/Users/Shared` (readable by every account) — home directories (`~/`, mode 700)
are not reachable from another profile, so an absolute path into another user's
home will not work.

## Releasing to npm

Published as [`ngx-translatorex-mcp`](https://www.npmjs.com/package/ngx-translatorex-mcp)
(currently `0.1.0-preview.0` under the `preview` dist-tag). Releases are automated.

### Automated (recommended) — push a tag

The `Publish MCP` workflow (`.github/workflows/publish-mcp.yml`) publishes on any
`mcp-v*` tag. It runs the unit tests, checks the tag matches `mcp/package.json`,
builds, and publishes — choosing the **dist-tag from the version**: a prerelease
(e.g. `0.1.0-preview.1`) goes to `preview`, a clean version (e.g. `0.1.0`) to
`latest`.

One-time setup (already done for this repo): create an npm **automation token**
(or a granular token with 2FA bypass) and add it as a repository secret named
`NPM_TOKEN`. Then, to release:

```bash
# version in mcp/package.json must match the tag
git tag mcp-v0.1.0-preview.0
git push origin mcp-v0.1.0-preview.0
```

### Manual (fallback)

From a **full checkout** (the build pulls in `../src/utils/*` via `tsconfig`
`rootDir: ".."`, so it can't run from the `mcp/` folder alone):

```bash
cd mcp
npm publish --tag preview      # or plain `npm publish` for a clean, latest release
```

Once published, the client config collapses to one line — no local build, no
absolute path:

```bash
claude mcp add ngx-translatorex \
  --env NGX_PROJECT_DIR=/abs/path/to/your/angular/project \
  -- npx -y ngx-translatorex-mcp
```

Alternatives:

- **Reserve the name without a `latest` yet** — bump to a `-preview` version
  (e.g. `0.1.0-preview`) and `npm publish --tag preview`. Still **public**, but
  only installs on request (`ngx-translatorex-mcp@preview`), never as the default
  `latest`, and prerelease versions are excluded from `^`/`~` ranges.
- **Truly private** is a paid npm feature (`--access restricted`, scoped name)
  and breaks `npx` for anyone without access — defeating the "any agent" goal.
  For private dogfooding use the tarball route above instead.
