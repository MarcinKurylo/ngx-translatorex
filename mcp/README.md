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
| `scanHardcodedStrings` | Find hard-coded strings in HTML templates → `{ file, line, text }[]` |
| `extractString` | Replace a string with a `translate` pipe and add its key across languages |
| `listMissingTranslations` | Per language, keys missing/untranslated with their source text |
| `setTranslations` | Write many translations at once |

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

The agent will call `scanHardcodedStrings` → `extractString` (per string, naming
keys itself) → `listMissingTranslations` → `setTranslations`.
