import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { EXTENSION_IDENTIFIER, HTML_SCAN_EXCLUDE } from './const';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { applyExtractionToText, findHardcodedStrings, locateHardcodedStrings, PlannedExtraction } from './utils/hardcodedStringUtils';
import { buildTranslationReport, flattenObject } from './utils/translationUtils';

/** Tool names, namespaced under the extension id (must match package.json contributions). */
const TOOL = {
  scan: `${EXTENSION_IDENTIFIER}_scanHardcodedStrings`,
  extract: `${EXTENSION_IDENTIFIER}_extractString`,
  listMissing: `${EXTENSION_IDENTIFIER}_listMissingTranslations`,
  setTranslation: `${EXTENSION_IDENTIFIER}_setTranslation`,
  setTranslations: `${EXTENSION_IDENTIFIER}_setTranslations`
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
      vscode.lm.registerTool(TOOL.listMissing, LanguageModelTools.listMissingTool()),
      vscode.lm.registerTool(TOOL.setTranslation, LanguageModelTools.setTranslationTool()),
      vscode.lm.registerTool(TOOL.setTranslations, LanguageModelTools.setTranslationsTool())
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
        if (text.includes('{{')) {
          return result({ extracted: 0, message: 'Cannot bulk-extract text containing an interpolation; extract it manually to bind its params.' });
        }
        const plan: PlannedExtraction[] = findHardcodedStrings(source, detectionOptions())
          .filter((candidate) => candidate.text === text)
          .map((candidate) => ({
            index: candidate.index,
            length: candidate.length,
            text: candidate.text,
            key,
            snippet: `{{ '${key}' | translate }}`
          }));
        if (!plan.length) {
          return result({ extracted: 0, message: `No hard-coded occurrence of that exact text found in ${file}` });
        }
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(applyExtractionToText(source, plan)));
        const { saved } = await FileSystemManager.addTranslation(key, text);
        if (saved) {
          FileSystemManager.cache[key] = text;
          FileSystemManager.onCacheChanged?.();
        }
        return result({ key, extracted: plan.length, keyCreated: saved });
      }
    };
  }

  /** Tool: list, per secondary language, the keys that are missing or still untranslated, with their source text. */
  private static listMissingTool(): vscode.LanguageModelTool<Record<string, never>> {
    return {
      invoke: async () => {
        const languages = await FileSystemManager.getAllLanguageTranslations();
        const mainLanguage = ExtensionConfigManager.getConfigValue('language') ?? 'en';
        const mainEntry = languages.find((entry) => entry.language === mainLanguage);
        const mainFlat = mainEntry ? flattenObject(mainEntry.tree) : {};
        const placeholder = ExtensionConfigManager.getPlaceholder();
        const withSource = (key: string) => ({ key, source: mainFlat[key] ?? null });
        const reports = buildTranslationReport(languages, placeholder)
          .filter((report) => report.language !== mainLanguage)
          .map((report) => ({
            language: report.language,
            missing: report.missing.map(withSource),
            untranslated: report.untranslated.map(withSource)
          }));
        return result({ mainLanguage, languages: reports });
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
        const { saved, written } = await FileSystemManager.setTranslations(options.input.translations ?? []);
        return result({ saved, written });
      }
    };
  }

  /**
   * Scans one template (when `file` is given) or every HTML template in the
   * workspace for hard-coded strings, returning flat `{ file, line, text }`
   * records. Reads via the file system with bounded concurrency.
   */
  private static async scan(file: string | undefined, token: vscode.CancellationToken): Promise<{ file: string; line: number; text: string }[]> {
    const decoder = new TextDecoder();
    const options = detectionOptions();
    const findings: { file: string; line: number; text: string }[] = [];
    const collect = (uri: vscode.Uri, text: string) => {
      for (const candidate of locateHardcodedStrings(text, options)) {
        findings.push({ file: vscode.workspace.asRelativePath(uri), line: candidate.line, text: candidate.text });
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
