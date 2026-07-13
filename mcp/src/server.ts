#!/usr/bin/env node
/**
 * Standalone Model Context Protocol server exposing ngx-translatorex's i18n
 * operations to any MCP-capable agent (Claude Desktop, Claude Code, etc.) — not
 * just Copilot. The agent supplies the reasoning (semantic key names, the
 * translated text); these tools do the deterministic file work. It reuses the
 * extension's pure logic via the `i18n` file layer.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as i18n from './i18n';

const tools = [
  {
    name: 'scanHardcodedStrings',
    description: 'Scan Angular HTML templates for hard-coded (untranslated) user-facing strings. Returns { file, line, text }. Optionally pass a single template path.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Optional project-relative .html path; omit to scan all templates.' } } }
  },
  {
    name: 'extractString',
    description: 'Replace every hard-coded occurrence of an exact text in a template with a translate pipe and add the key (with the text as its main-language value) across all languages. Choose a meaningful nested key like "page.title".',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Project-relative .html path.' },
        text: { type: 'string', description: 'Exact hard-coded text, as returned by scanHardcodedStrings.' },
        key: { type: 'string', description: 'Dotted i18n key to create, e.g. "page.title".' }
      },
      required: ['file', 'text', 'key']
    }
  },
  {
    name: 'listMissingTranslations',
    description: 'Per secondary language, list keys that are missing or still hold the placeholder, each with its main-language source text. Then translate and write them with setTranslations.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'listUndefinedKeys',
    description: 'List translate-pipe / TranslateService key references in templates and components that do not exist in the main language file (dead references). Returns { file, line, key }.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'setTranslations',
    description: 'Write many translations across language files at once. Preserve any {{ interpolation }} tokens exactly. Returns how many entries were written.',
    inputSchema: {
      type: 'object',
      properties: {
        translations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              key: { type: 'string' },
              value: { type: 'string' }
            },
            required: ['language', 'key', 'value']
          }
        }
      },
      required: ['translations']
    }
  }
];

const server = new Server({ name: 'ngx-translatorex', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    let data: unknown;
    switch (name) {
      case 'scanHardcodedStrings':
        data = i18n.scan(args.file as string | undefined);
        break;
      case 'extractString':
        data = i18n.extract(args.file as string, args.text as string, args.key as string);
        break;
      case 'listMissingTranslations':
        data = i18n.listMissing();
        break;
      case 'listUndefinedKeys':
        data = i18n.listUndefinedKeys();
        break;
      case 'setTranslations':
        data = i18n.setTranslations((args.translations as { language: string; key: string; value: string }[]) ?? []);
        break;
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
  }
});

server.connect(new StdioServerTransport()).catch((error) => {
  process.stderr.write(`ngx-translatorex-mcp failed to start: ${error}\n`);
  process.exit(1);
});
