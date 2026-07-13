/**
 * Node file-system layer for the standalone MCP server. Mirrors what
 * `FileSystemManager` does inside the extension, but with plain `fs` (no
 * `vscode`), so any MCP-capable agent can run the same i18n operations. Reuses
 * the extension's pure logic for detection and tree manipulation.
 *
 * Configuration comes from environment variables so an MCP client can point the
 * server at a project:
 *  - `NGX_PROJECT_DIR`  project root scanned for templates (default: cwd)
 *  - `NGX_I18N_DIR`     folder holding `<lang>.json` files (default: `<root>/src/assets/i18n`)
 *  - `NGX_MAIN_LANG`    main language code (default: `en`)
 *  - `NGX_PLACEHOLDER`  untranslated-key placeholder
 */
import * as fs from 'fs';
import * as path from 'path';
import { TranslationTree, findUntranslatedKeys, flattenObject, setKey, sortObject } from '../../src/utils/translationUtils';
import { applyExtractionToText, findHardcodedStrings, interpolationSnippet, locateHardcodedStrings, normalizeInterpolation } from '../../src/utils/hardcodedStringUtils';
import { paramsPreserved } from '../../src/utils/translationLmUtils';
import { findTranslateKeys } from '../../src/utils/diagnosticsUtils';

const PROJECT_DIR = process.env.NGX_PROJECT_DIR || process.cwd();
const I18N_DIR = process.env.NGX_I18N_DIR || path.join(PROJECT_DIR, 'src/assets/i18n');
const MAIN_LANG = process.env.NGX_MAIN_LANG || 'en';
const PLACEHOLDER = process.env.NGX_PLACEHOLDER || '[TODO] translation not implemented';
const SORT_ON_SAVE = process.env.NGX_SORT_ON_SAVE === 'true';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.angular', 'out', 'coverage', '.git']);
const DETECTION = { minLength: 2, ignore: [] as string[] };

const languageFile = (language: string) => path.join(I18N_DIR, `${language}.json`);

const readTree = (language: string): TranslationTree => {
  const file = languageFile(language);
  if (!fs.existsSync(file)) {
    return {};
  }
  const raw = fs.readFileSync(file, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
};

const writeTree = (language: string, tree: TranslationTree): void => {
  const output = SORT_ON_SAVE ? sortObject(tree) : tree;
  fs.writeFileSync(languageFile(language), `${JSON.stringify(output, null, 2)}\n`);
};

/** Language codes derived from the `*.json` files in the i18n folder. */
export const listLanguages = (): string[] =>
  fs.existsSync(I18N_DIR)
    ? fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    : [];

/** Files with any of the given extensions under the project root, excluding build/dependency folders. */
const walk = (extensions: string[], dir = PROJECT_DIR): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        out.push(...walk(extensions, full));
      }
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
};

/** Every `.html` template under the project root. */
const listTemplates = (): string[] => walk(['.html']);

/** Every `.html` and `.ts` source file under the project root. */
const listSourceFiles = (): string[] => walk(['.html', '.ts']);

/** Scans one template (relative path) or all templates for hard-coded strings. */
export const scan = (file?: string): { file: string; line: number; text: string }[] => {
  const files = file ? [path.resolve(PROJECT_DIR, file)] : listTemplates();
  const findings: { file: string; line: number; text: string }[] = [];
  for (const abs of files) {
    if (!fs.existsSync(abs)) {
      continue;
    }
    for (const candidate of locateHardcodedStrings(fs.readFileSync(abs, 'utf8'), DETECTION)) {
      findings.push({ file: path.relative(PROJECT_DIR, abs), line: candidate.line, text: candidate.text });
    }
  }
  return findings;
};

/**
 * Replaces every hard-coded occurrence of `text` in a template with a
 * `translate` pipe and adds the key across all language files (real value in the
 * main language, placeholder elsewhere).
 */
export const extract = (file: string, text: string, key: string): { key: string; extracted: number; params?: string[]; message?: string } => {
  const abs = path.resolve(PROJECT_DIR, file);
  if (!fs.existsSync(abs)) {
    return { key, extracted: 0, message: `File not found: ${file}` };
  }
  const source = fs.readFileSync(abs, 'utf8');
  const { value, params } = normalizeInterpolation(text);
  const snippet = interpolationSnippet(key, params);
  const plan = findHardcodedStrings(source, DETECTION)
    .filter((candidate) => candidate.text === text)
    .map((candidate) => ({ index: candidate.index, length: candidate.length, text: value, key, snippet }));
  if (!plan.length) {
    return { key, extracted: 0, message: `No hard-coded occurrence of that text found in ${file}` };
  }
  fs.writeFileSync(abs, applyExtractionToText(source, plan));
  for (const language of listLanguages()) {
    const tree = readTree(language);
    if (language === MAIN_LANG) {
      setKey(tree, key, value);
    } else if (flattenObject(tree)[key] === undefined) {
      setKey(tree, key, PLACEHOLDER);
    } else {
      continue;
    }
    writeTree(language, tree);
  }
  return { key, extracted: plan.length, params: params.map((param) => param.name) };
};

/** Per secondary language, the keys missing or still placeholder, with their main-language source. */
export const listMissing = (): { mainLanguage: string; languages: { language: string; untranslated: { key: string; source: string }[] }[] } => {
  const mainFlat = flattenObject(readTree(MAIN_LANG));
  const languages = listLanguages()
    .filter((language) => language !== MAIN_LANG)
    .map((language) => ({
      language,
      untranslated: findUntranslatedKeys(mainFlat, flattenObject(readTree(language)), PLACEHOLDER)
        .map((key) => ({ key, source: mainFlat[key] }))
    }));
  return { mainLanguage: MAIN_LANG, languages };
};

/**
 * Writes many translations across language files, one read/write per file. Each
 * value is validated against the main-language source: one that drops a
 * `{{ param }}` is skipped rather than written.
 */
export const setTranslations = (items: { language: string; key: string; value: string }[]): { written: number; skipped: number } => {
  const mainFlat = flattenObject(readTree(MAIN_LANG));
  const byLanguage = new Map<string, { language: string; tree: TranslationTree }>();
  const known = new Set(listLanguages());
  let written = 0;
  let skipped = 0;
  for (const item of items) {
    if (!known.has(item.language)) {
      continue;
    }
    const source = mainFlat[item.key];
    if (typeof source === 'string' && !paramsPreserved(source, item.value)) {
      skipped++;
      continue;
    }
    if (!byLanguage.has(item.language)) {
      byLanguage.set(item.language, { language: item.language, tree: readTree(item.language) });
    }
    setKey(byLanguage.get(item.language)!.tree, item.key, item.value);
    written++;
  }
  for (const { language, tree } of byLanguage.values()) {
    writeTree(language, tree);
  }
  return { written, skipped };
};

/** Lists `translate` key references in templates/components that don't exist in the main language. */
export const listUndefinedKeys = (): { file: string; line: number; key: string }[] => {
  const mainFlat = flattenObject(readTree(MAIN_LANG));
  const undefinedKeys: { file: string; line: number; key: string }[] = [];
  for (const abs of listSourceFiles()) {
    const text = fs.readFileSync(abs, 'utf8');
    const languageId = abs.endsWith('.ts') ? 'typescript' : 'html';
    for (const ref of findTranslateKeys(text, languageId)) {
      if (mainFlat[ref.key] === undefined) {
        undefinedKeys.push({ file: path.relative(PROJECT_DIR, abs), line: text.slice(0, ref.index).split('\n').length, key: ref.key });
      }
    }
  }
  return undefinedKeys;
};
