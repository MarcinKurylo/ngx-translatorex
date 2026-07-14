# ngx-translatorex MCP server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes ngx-translatorex's i18n operations to **any** MCP-capable agent (Claude
Desktop, Claude Code, …) — not just Copilot. The agent supplies the reasoning
(semantic key names, the translated text); these tools do the deterministic file
work, reusing the extension's own pure logic.

It is intentionally kept out of the VS Code extension package (the extension has
its own in-editor Language Model tools); this is for driving the same workflow
from an external agent.

## Tools

| Tool | Purpose |
| --- | --- |
| `scanHardcodedStrings` | Find hard-coded strings in HTML templates → `{ file, line, text, category, confidence }[]` |
| `extractStrings` | Batch: extract many strings at once; omit an item's `files` to apply to every template |
| `extractString` | Replace one string with a `translate` pipe and add its key across languages (interpolated text is bound as params; reports `partial` when your text is only a fragment of a larger node) |
| `listMissingTranslations` | Keys missing/untranslated with their source; `summary` (default) returns counts + per-prefix histogram, `summary:false` + `prefix`/`language`/`limit`/`offset` returns detail |
| `listUndefinedKeys` | Keys referenced in code but defined in no i18n file (dead references) |
| `setTranslations` | Write many translations at once (values that drop a `{{ param }}` are skipped; `dryRun` previews) |
| `seedMissingTranslations` | Fill still-missing keys with the placeholder or a copy of the source (`copySource`); `dryRun` previews |

A `localize-project` prompt is also exposed (MCP `prompts` capability) — a ready-made
workflow that walks the agent through scan → batch-extract → summary-first
listMissing → batched setTranslations.

## Build

```bash
cd mcp
npm install
npm run build      # → dist/mcp/src/server.js
```

## Configuration

The server is pointed at a project via environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NGX_PROJECT_DIR` | cwd | Project root scanned for `.html` templates |
| `NGX_I18N_DIR` | `<root>/src/assets/i18n` | Folder holding `<lang>.json` files |
| `NGX_MAIN_LANG` | `en` | Main language code |
| `NGX_PLACEHOLDER` | `[TODO] translation not implemented` | Untranslated-key placeholder |
| `NGX_SORT_ON_SAVE` | `false` | Set to `true` to alphabetically sort each i18n file on write |
| `NGX_HARDCODED_MIN_LENGTH` | `2` | Minimum trimmed length for a scanned hard-coded string |
| `NGX_HARDCODED_IGNORE` | (none) | Comma-separated literal/`*`-glob patterns to skip during the scan |

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "ngx-translatorex": {
      "command": "node",
      "args": ["/abs/path/to/ngx-translatorex/mcp/dist/mcp/src/server.js"],
      "env": {
        "NGX_PROJECT_DIR": "/abs/path/to/your/angular/project",
        "NGX_MAIN_LANG": "en"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add ngx-translatorex \
  --env NGX_PROJECT_DIR=/abs/path/to/your/angular/project \
  -- node /abs/path/to/ngx-translatorex/mcp/dist/mcp/src/server.js
```

## Example prompt

> Scan my templates for hard-coded strings, extract them into sensible i18n keys,
> and translate everything that's missing into all languages.

The agent will call `scanHardcodedStrings` → `extractStrings` (batched, naming
keys itself) → `listMissingTranslations` (summary first) → `setTranslations`
(batched). The `localize-project` prompt spells this workflow out.

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

## Publishing to npm (future — makes it public)

Not published yet. When promoting the "works with any agent" angle:

1. **Add a build-on-install hook** so registry/git consumers get a fresh `dist/`:
   ```jsonc
   // package.json
   "scripts": { "build": "tsc -p ./", "prepare": "npm run build" }
   ```
   (`prepare` runs on `npm install` from git and before `npm publish`. Consumers
   of a published tarball already get the prebuilt `dist/` via the `files` field,
   but `prepare` keeps git installs and publishes self-building. Note the build
   pulls in `../src/utils/*` via `tsconfig` `rootDir: ".."`, so it must run from a
   full checkout, not the `mcp/` folder alone.)
2. **Public release:** `npm publish` (unscoped `ngx-translatorex-mcp`) →
   `npx -y ngx-translatorex-mcp` works for everyone, one-line config, still
   per-project `NGX_PROJECT_DIR`.
3. **Reserve the name without a `latest` yet:** `npm publish --tag preview` with a
   `-preview` version (e.g. `0.1.0-preview`). It is still **public**, but only
   installs on request (`ngx-translatorex-mcp@preview`) and never as the default
   `latest`; prerelease versions are also excluded from `^`/`~` ranges.
4. **Truly private** is a paid npm feature (`--access restricted`, scoped name)
   and breaks `npx` for anyone without access — so it defeats the "any agent"
   goal. For private dogfooding use the tarball above instead.
