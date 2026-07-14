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
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import * as i18n from './i18n';

const tools = [
  {
    name: 'scanHardcodedStrings',
    description: 'Scan Angular HTML templates for hard-coded (untranslated) user-facing strings. Call this FIRST to discover what needs extracting. Returns { file, line, text, category, confidence } — category is "text" (a text node) or "attribute"; confidence is "high"/"low". Filter on these to skip likely false positives without opening files. Detection honours the project ignore list and inline `i18n-ignore` markers. Omit `file` to scan the whole project in one call rather than looping per file.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Optional project-relative .html path; omit to scan all templates in one call.' } } }
  },
  {
    name: 'extractStrings',
    description: 'Extract MANY hard-coded strings into i18n keys in ONE call (batch — prefer this over extractString when you have more than one). For each item, replaces every occurrence of the exact text with a `{{ key | translate }}` pipe and adds the key across all language files. Omit an item\'s `files` to extract that text from EVERY template (common for shared buttons/labels). Key naming: meaningful, nested, by feature/area/element, e.g. "checkout.summary.total"; reuse the same key for identical text. Returns per item how many occurrences were replaced and in which files.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Extractions to perform in this batch. Group everything you found into a single call.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Exact hard-coded text, as returned by scanHardcodedStrings.' },
              key: { type: 'string', description: 'Dotted i18n key to create, e.g. "page.title". Semantic and consistent; reuse for identical text.' },
              files: { type: 'array', items: { type: 'string' }, description: 'Optional project-relative .html paths; omit to extract this text from every template.' }
            },
            required: ['text', 'key']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'extractString',
    description: 'Single-string variant of extractStrings (prefer extractStrings for more than one). Replace every hard-coded occurrence of an exact text in a template with a translate pipe and add the key (with the text as its main-language value) across all languages. Key naming: meaningful, nested, by feature/area/element, e.g. "checkout.summary.total", "actions.save"; reuse the same key for identical text. When the text is not found exactly, returns partial:true with the containing node when your text is only a fragment of a larger (e.g. interpolated) node — extract that whole node instead.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Project-relative .html path.' },
        text: { type: 'string', description: 'Exact hard-coded text, as returned by scanHardcodedStrings.' },
        key: { type: 'string', description: 'Dotted i18n key to create, e.g. "page.title". Semantic and consistent; reuse for identical text.' }
      },
      required: ['file', 'text', 'key']
    }
  },
  {
    name: 'listMissingTranslations',
    description: 'List keys that are missing or still hold the placeholder, with their main-language source. Call with summary:true (default) FIRST — it returns per-language and per-prefix counts only (no source blobs), safe on large projects. Then pull details with summary:false plus `prefix`/`language`/`limit`/`offset`. Never request the full detail unprefixed on a large project — it can overflow the context window. Then translate and write with setTranslations in one batched call.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'boolean', description: 'Default true: return counts + per-prefix histogram only. Set false to get key/source detail (use with prefix/limit).' },
        prefix: { type: 'string', description: 'Only keys equal to or nested under this dotted prefix (e.g. "checkout").' },
        language: { type: 'string', description: 'Only this secondary language code.' },
        limit: { type: 'number', description: 'Detail mode: max entries to return (default 100).' },
        offset: { type: 'number', description: 'Detail mode: entries to skip, for pagination.' }
      }
    }
  },
  {
    name: 'listUndefinedKeys',
    description: 'List translate-pipe / TranslateService key references in templates and components that do not exist in the main language file (dead references). Returns { file, line, key }.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'setTranslations',
    description: 'Write many translations across language files at once. ALWAYS batch — pass every key/language you have in ONE call; never loop one call per key. Preserve any {{ interpolation }} tokens exactly (a value that drops a source param is skipped). Returns how many entries were written and skipped.',
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

/** Workflow prompt steering an agent through the end-to-end localization flow. */
const LOCALIZE_PROMPT = [
  'Localize this Angular ngx-translate project end to end. Follow this workflow and batch aggressively:',
  '',
  '1. scanHardcodedStrings (omit `file`) — find hard-coded user-facing text in one pass. Skip low-confidence/non-text hits you judge to be false positives.',
  '2. extractStrings — pass ALL findings in ONE batched call. Use semantic, nested keys (feature.area.element, e.g. "checkout.summary.total"); reuse the same key for identical text. Omit an item\'s `files` for text shared across templates.',
  '3. listMissingTranslations with summary:true — read the per-prefix counts. Then, per prefix, call it with summary:false + prefix + limit to pull the source text to translate.',
  '4. Translate each source string yourself, preserving every {{ param }} token exactly. Write results with setTranslations in ONE batched call per run — never one call per key.',
  '5. listUndefinedKeys — reconcile any dead references you introduced or found.',
  '',
  'Rules: never loop single-key writes; keep keys semantic and consistent; prefer summary before detail so you never dump the whole missing-translations blob.'
].join('\n');

const prompts = [
  {
    name: 'localize-project',
    description: 'End-to-end workflow to scan, extract, and translate this ngx-translate project efficiently (batching + summary-first).'
  }
];

const server = new Server({ name: 'ngx-translatorex', version: '0.1.0' }, { capabilities: { tools: {}, prompts: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== 'localize-project') {
    throw new Error(`Unknown prompt: ${request.params.name}`);
  }
  return {
    description: prompts[0].description,
    messages: [{ role: 'user', content: { type: 'text', text: LOCALIZE_PROMPT } }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    let data: unknown;
    switch (name) {
      case 'scanHardcodedStrings':
        data = i18n.scan(args.file as string | undefined);
        break;
      case 'extractStrings':
        data = i18n.extractStrings((args.items as { text: string; key: string; files?: string[] }[]) ?? []);
        break;
      case 'extractString':
        data = i18n.extract(args.file as string, args.text as string, args.key as string);
        break;
      case 'listMissingTranslations':
        data = i18n.listMissing({
          summary: args.summary as boolean | undefined,
          prefix: args.prefix as string | undefined,
          language: args.language as string | undefined,
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined
        });
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
