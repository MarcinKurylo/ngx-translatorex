import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { EXTENSION_IDENTIFIER, HTML_SCAN_EXCLUDE } from './const';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { applyExtractionToText, findHardcodedStrings, interpolationSnippet, locateHardcodedStrings, normalizeInterpolation, PlannedExtraction } from './utils/hardcodedStringUtils';
import { findTranslateKeys } from './utils/diagnosticsUtils';
import { buildTranslationReport, flattenObject } from './utils/translationUtils';
import { ListMissingOptions, UntranslatedItem, findContainingCandidate, planFileExtractions, shapeMissingTranslations } from './utils/i18nToolUtils';

/** Tool names, namespaced under the extension id (must match package.json contributions). */
const TOOL = {
  scan: `${EXTENSION_IDENTIFIER}_scanHardcodedStrings`,
  extract: `${EXTENSION_IDENTIFIER}_extractString`,
  extractStrings: `${EXTENSION_IDENTIFIER}_extractStrings`,
  listMissing: `${EXTENSION_IDENTIFIER}_listMissingTranslations`,
  setTranslation: `${EXTENSION_IDENTIFIER}_setTranslation`,
  setTranslations: `${EXTENSION_IDENTIFIER}_setTranslations`,
  listUndefinedKeys: `${EXTENSION_IDENTIFIER}_listUndefinedKeys`
};

/** How many template files to read at once during a scan. */
const SCAN_CONCURRENCY = 24;

/** Wraps any value as a text tool result (objects are JSON-encoded for the model). */
const result = (value: unknown): vscode.LanguageModelToolResult =>
  new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(typeof value === 'string' ? value : JSON.stringify(value))
  ]);

/** Detection options taken from the user's settings, shared by scan and extract. */
const detectionOptions = () => ({
  minLength: ExtensionConfigManager.getNumberConfigValue('hardcodedStringsMinLength', 2),
  ignore: ExtensionConfigManager.getArrayConfigValue('hardcodedStringsIgnore')
});

/**
 * Exposes the extension's core operations as VS Code Language Model tools so an
 * AI agent (e.g. Copilot's agent mode) can drive the whole i18n flow:
 * scan for hard-coded strings, extract them into keys, see what's still missing,
 * and write translations (singly or in a batch). Each tool is a thin, structured wrapper over the same
 * engine the commands use; the agent supplies the reasoning (semantic key names,
 * the translated text).
 */
export class LanguageModelTools {

  /**
   * Registers every language-model tool. Returns an empty list when the Language
   * Model Tools API is unavailable (older VS Code), so activation stays safe.
   */
  public static register(): vscode.Disposable[] {
    if (typeof vscode.lm?.registerTool !== 'function') {
      return [];
    }
    return [
      vscode.lm.registerTool(TOOL.scan, LanguageModelTools.scanTool()),
      vscode.lm.registerTool(TOOL.extract, LanguageModelTools.extractTool()),
      vscode.lm.registerTool(TOOL.extractStrings, LanguageModelTools.extractStringsTool()),
      vscode.lm.registerTool(TOOL.listMissing, LanguageModelTools.listMissingTool()),
      vscode.lm.registerTool(TOOL.setTranslation, LanguageModelTools.setTranslationTool()),
      vscode.lm.registerTool(TOOL.setTranslations, LanguageModelTools.setTranslationsTool()),
      vscode.lm.registerTool(TOOL.listUndefinedKeys, LanguageModelTools.listUndefinedKeysTool())
    ];
  }

  /** Tool: scan templates for hard-coded strings, returning `{ file, line, text }[]`. */
  private static scanTool(): vscode.LanguageModelTool<{ file?: string }> {
    return {
      invoke: async (options, token) => result(await LanguageModelTools.scan(options.input.file, token))
    };
  }

  /** Tool: replace a hard-coded string in a file with a `translate` pipe and add its key everywhere. */
  private static extractTool(): vscode.LanguageModelTool<{ file: string; text: string; key: string }> {
    return {
      prepareInvocation: (options) => ({
        invocationMessage: `Extracting “${options.input.text}” → ${options.input.key}`,
        confirmationMessages: {
          title: 'Extract hard-coded string',
          message: `Replace “${options.input.text}” in \`${options.input.file}\` with key \`${options.input.key}\` and add it to every language file?`
        }
      }),
      invoke: async (options) => {
        const { file, text, key } = options.input;
        const uri = (await vscode.workspace.findFiles(file, undefined, 1))[0];
        if (!uri) {
          return result({ extracted: 0, message: `File not found: ${file}` });
        }
        const decoder = new TextDecoder();
        const source = decoder.decode(await vscode.workspace.fs.readFile(uri));
        const { value, params } = normalizeInterpolation(text);
        const snippet = interpolationSnippet(key, params);
        const plan: PlannedExtraction[] = findHardcodedStrings(source, detectionOptions())
          .filter((candidate) => candidate.text === text)
          .map((candidate) => ({ index: candidate.index, length: candidate.length, text: value, key, snippet }));
        if (!plan.length) {
          const containing = findContainingCandidate(source, text, detectionOptions());
          if (containing) {
            return result({ extracted: 0, partial: true, containingText: containing.containingText, message: `That text is only a fragment of “${containing.containingText}” in ${file}. Extract that whole node instead (its {{ interpolation }} becomes a bound param).` });
          }
          return result({ extracted: 0, message: `No hard-coded occurrence of that exact text found in ${file}` });
        }
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(applyExtractionToText(source, plan)));
        const { saved } = await FileSystemManager.addTranslation(key, value);
        if (saved) {
          FileSystemManager.cache[key] = value;
          FileSystemManager.onCacheChanged?.();
        }
        return result({ key, extracted: plan.length, keyCreated: saved, params: params.map((param) => param.name) });
      }
    };
  }

  /**
   * Tool: extract many hard-coded strings into keys in one confirmed batch. Each
   * item replaces its exact text across the given files (or every template when
   * `files` is omitted) and its key is added across the language files.
   */
  private static extractStringsTool(): vscode.LanguageModelTool<{ items: { text: string; key: string; files?: string[] }[] }> {
    return {
      prepareInvocation: (options) => {
        const count = options.input.items?.length ?? 0;
        return {
          invocationMessage: `Extracting ${count} string(s)`,
          confirmationMessages: {
            title: 'Extract hard-coded strings',
            message: `Replace ${count} hard-coded string(s) across the templates and add their keys to every language file?`
          }
        };
      },
      invoke: async (options) => {
        const items = options.input.items ?? [];
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const detection = detectionOptions();
        const allTemplates = await vscode.workspace.findFiles('**/*.html', HTML_SCAN_EXCLUDE);
        const perFile = new Map<string, { uri: vscode.Uri; requests: { text: string; key: string; item: number }[] }>();
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          const uris = item.files?.length
            ? (await Promise.all(item.files.map((file) => vscode.workspace.findFiles(file, undefined, 1)))).flatMap((found) => found.slice(0, 1))
            : allTemplates;
          for (const uri of uris) {
            const entry = perFile.get(uri.toString()) ?? { uri, requests: [] };
            entry.requests.push({ text: item.text, key: item.key, item: index });
            perFile.set(uri.toString(), entry);
          }
        }

        const accumulated = items.map(() => ({ extracted: 0, files: new Set<string>() }));
        for (const { uri, requests } of perFile.values()) {
          const source = decoder.decode(await vscode.workspace.fs.readFile(uri));
          const { plan, outcomes } = planFileExtractions(source, requests.map((request) => ({ text: request.text, key: request.key })), detection);
          if (plan.length) {
            await vscode.workspace.fs.writeFile(uri, encoder.encode(applyExtractionToText(source, plan)));
          }
          outcomes.forEach((outcome, position) => {
            const index = requests[position].item;
            accumulated[index].extracted += outcome.extracted;
            if (outcome.extracted) {
              accumulated[index].files.add(vscode.workspace.asRelativePath(uri));
            }
          });
        }

        const seen = new Set<string>();
        for (let index = 0; index < items.length; index++) {
          if (accumulated[index].extracted === 0 || seen.has(items[index].key)) {
            continue;
          }
          seen.add(items[index].key);
          const value = normalizeInterpolation(items[index].text).value;
          const { saved } = await FileSystemManager.addTranslation(items[index].key, value);
          if (saved) {
            FileSystemManager.cache[items[index].key] = value;
          }
        }
        FileSystemManager.onCacheChanged?.();

        return result({
          results: items.map((item, index) => {
            const extracted = accumulated[index].extracted;
            const params = normalizeInterpolation(item.text).params.map((param) => param.name);
            return {
              key: item.key,
              text: item.text,
              extracted,
              files: [...accumulated[index].files],
              ...(params.length ? { params } : {}),
              ...(extracted === 0 ? { message: 'No hard-coded occurrence of that exact text found' } : {})
            };
          })
        });
      }
    };
  }

  /**
   * Tool: keys missing or still untranslated, with their source text. Defaults
   * to a compact summary (counts + per-prefix histogram); `summary: false` with
   * `prefix`/`language`/`limit`/`offset` returns paginated detail — so a large
   * catalogue never dumps its whole blob into the agent's context.
   */
  private static listMissingTool(): vscode.LanguageModelTool<ListMissingOptions> {
    return {
      invoke: async (options) => {
        const languages = await FileSystemManager.getAllLanguageTranslations();
        const mainLanguage = ExtensionConfigManager.getConfigValue('language') ?? 'en';
        const mainEntry = languages.find((entry) => entry.language === mainLanguage);
        const mainFlat = mainEntry ? flattenObject(mainEntry.tree) : {};
        const placeholder = ExtensionConfigManager.getPlaceholder();
        const items: UntranslatedItem[] = buildTranslationReport(languages, placeholder)
          .filter((report) => report.language !== mainLanguage)
          .flatMap((report) =>
            [...report.missing, ...report.untranslated].map((key) => ({
              language: report.language,
              key,
              source: mainFlat[key] ?? null
            }))
          );
        return result({ mainLanguage, ...shapeMissingTranslations(items, options.input) });
      }
    };
  }

  /** Tool: write a single translation into a specific language file. */
  private static setTranslationTool(): vscode.LanguageModelTool<{ language: string; key: string; value: string }> {
    return {
      prepareInvocation: (options) => ({
        invocationMessage: `Setting ${options.input.language} · ${options.input.key}`,
        confirmationMessages: {
          title: 'Write translation',
          message: `Set \`${options.input.key}\` = “${options.input.value}” in \`${options.input.language}.json\`?`
        }
      }),
      invoke: async (options) => {
        const saved = await FileSystemManager.setTranslationForLanguage(
          options.input.language,
          options.input.key,
          options.input.value
        );
        return result({ saved });
      }
    };
  }

  /** Tool: write many translations across language files in one confirmed batch. */
  private static setTranslationsTool(): vscode.LanguageModelTool<{ translations: { language: string; key: string; value: string }[] }> {
    return {
      prepareInvocation: (options) => {
        const count = options.input.translations?.length ?? 0;
        return {
          invocationMessage: `Writing ${count} translation(s)`,
          confirmationMessages: {
            title: 'Write translations',
            message: `Write ${count} translation(s) across the language files?`
          }
        };
      },
      invoke: async (options) => {
        const { saved, written, skipped } = await FileSystemManager.setTranslations(options.input.translations ?? []);
        return result({ saved, written, skipped });
      }
    };
  }

  /** Tool: list keys referenced in templates/components that don't exist in any i18n file. */
  private static listUndefinedKeysTool(): vscode.LanguageModelTool<Record<string, never>> {
    return {
      invoke: async (_options, token) => result(await LanguageModelTools.scanUndefinedKeys(token))
    };
  }

  /**
   * Scans HTML and TypeScript for `translate` key references that are absent from
   * the current translations, returning `{ file, line, key }` records.
   */
  private static async scanUndefinedKeys(token: vscode.CancellationToken): Promise<{ file: string; line: number; key: string }[]> {
    const decoder = new TextDecoder();
    const uris = await vscode.workspace.findFiles('**/*.{html,ts}', HTML_SCAN_EXCLUDE, undefined, token);
    const undefinedKeys: { file: string; line: number; key: string }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < uris.length && !token.isCancellationRequested) {
        const uri = uris[next++];
        try {
          const text = decoder.decode(await vscode.workspace.fs.readFile(uri));
          const languageId = uri.path.endsWith('.ts') ? 'typescript' : 'html';
          for (const ref of findTranslateKeys(text, languageId)) {
            if (FileSystemManager.cache[ref.key] === undefined) {
              const line = text.slice(0, ref.index).split('\n').length;
              undefinedKeys.push({ file: vscode.workspace.asRelativePath(uri), line, key: ref.key });
            }
          }
        } catch {
          // Unreadable file — skip it.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, uris.length) }, worker));
    return undefinedKeys;
  }

  /**
   * Scans one template (when `file` is given) or every HTML template in the
   * workspace for hard-coded strings, returning flat `{ file, line, text }`
   * records. Reads via the file system with bounded concurrency.
   */
  private static async scan(file: string | undefined, token: vscode.CancellationToken): Promise<{ file: string; line: number; text: string; category: string; confidence: string }[]> {
    const decoder = new TextDecoder();
    const options = detectionOptions();
    const findings: { file: string; line: number; text: string; category: string; confidence: string }[] = [];
    const collect = (uri: vscode.Uri, text: string) => {
      for (const candidate of locateHardcodedStrings(text, options)) {
        findings.push({
          file: vscode.workspace.asRelativePath(uri),
          line: candidate.line,
          text: candidate.text,
          category: candidate.category,
          confidence: candidate.confidence
        });
      }
    };
    if (file) {
      const uri = (await vscode.workspace.findFiles(file, undefined, 1))[0];
      if (uri) {
        collect(uri, decoder.decode(await vscode.workspace.fs.readFile(uri)));
      }
      return findings;
    }
    const uris = await vscode.workspace.findFiles('**/*.html', HTML_SCAN_EXCLUDE, undefined, token);
    let next = 0;
    const worker = async () => {
      while (next < uris.length && !token.isCancellationRequested) {
        const uri = uris[next++];
        try {
          collect(uri, decoder.decode(await vscode.workspace.fs.readFile(uri)));
        } catch {
          // Unreadable file — skip it.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, uris.length) }, worker));
    return findings;
  }
}
