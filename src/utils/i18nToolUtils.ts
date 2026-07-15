/**
 * Pure, VS Code-independent helpers shared by the two agent surfaces — the
 * in-editor Language Model tools (`languageModelTools.ts`) and the standalone
 * MCP server (`mcp/src/i18n.ts`). Kept free of the `vscode` and `fs` modules so
 * the token-efficiency logic can be unit-tested directly. (`path` is pure
 * string arithmetic — no I/O — so it stays within that rule.)
 */

import * as path from 'path';
import {
  HardcodedStringOptions,
  PlannedExtraction,
  findHardcodedStrings,
  interpolationSnippet,
  normalizeInterpolation
} from './hardcodedStringUtils';
import { TranslationTree, findUntranslatedKeys, flattenObject, hasWriteConflict, isKeyValid } from './translationUtils';
import { paramsPreserved } from './translationLmUtils';

/**
 * Resolves a caller-supplied path against a root and returns it only when it
 * stays inside that root, `undefined` otherwise.
 *
 * The agent surfaces take file paths straight from the model, which is not a
 * trusted source: the server hands the model text scanned out of the project's
 * own templates, so a path can carry an instruction injected into a template.
 * Containment has to be asserted *after* resolving, because `path.resolve`
 * honours both `../` and an absolute path (which discards the root entirely) —
 * inspecting the raw input for `..` is not equivalent.
 *
 * Comparison is lexical, so the caller is responsible for resolving symlinks
 * first when the path may be one.
 */
export function resolveContainedPath(root: string, file: string): string | undefined {
  const base = path.resolve(root);
  const abs = path.resolve(base, file);
  return abs === base || abs.startsWith(base + path.sep) ? abs : undefined;
}

/** Why an agent's translation write was refused. */
export type WriteRejection = 'invalid-key' | 'params-lost' | 'key-conflict';

/**
 * Whether an agent may create this key at all, checked against the main language
 * before anything is written.
 *
 * Refusing here is what keeps a conflict from spreading: creating
 * `home.greeting.formal` while `home.greeting` is a translated string discards
 * that string, and then every secondary language is told the new key is missing —
 * so the next write destroys their translation of `home.greeting` too. The agent
 * chooses its own key names and cannot see that a name is taken, so it is told,
 * and picks another.
 */
export function rejectKeyCreation(key: string, mainTree: TranslationTree): WriteRejection | undefined {
  if (!isKeyValid(key, 'key')) {
    return 'invalid-key';
  }
  return hasWriteConflict(mainTree, key) ? 'key-conflict' : undefined;
}

/** The agent-facing explanation for a refused key — identical on both surfaces. */
export function rejectionMessage(reason: WriteRejection, key: string): string {
  switch (reason) {
    case 'invalid-key':
      return `Key "${key}" is not a valid i18n key.`;
    case 'params-lost':
      return `The value for "${key}" drops or changes a {{ param }} from the main language.`;
    case 'key-conflict':
      return `Key "${key}" conflicts with an existing translation: a parent name already holds text, or the key is already a namespace. Pick another key.`;
  }
}

/**
 * The one rule set deciding whether an agent may write a translation. Both agent
 * surfaces call this instead of each re-deriving the guards: they had drifted to
 * three different answers — the extension's single-key tool checked nothing, its
 * batch tool checked params only, and the MCP server checked params and the key.
 *
 * @returns the reason to skip the item, or `undefined` when it is safe to write.
 */
export function rejectTranslationWrite(
  item: { key: string; value: string },
  mainFlat: { [key: string]: string },
  targetTree: TranslationTree
): WriteRejection | undefined {
  if (!isKeyValid(item.key, 'key')) {
    return 'invalid-key';
  }
  const source = mainFlat[item.key];
  if (typeof source === 'string' && !paramsPreserved(source, item.value)) {
    return 'params-lost';
  }
  if (hasWriteConflict(targetTree, item.key)) {
    return 'key-conflict';
  }
  return undefined;
}

/**
 * Plans a starting value for every key a secondary language still lacks
 * (missing, or holding the placeholder): either the placeholder itself, or a
 * copy of the main-language source when `copySource` is set. No-op writes (the
 * key already holds the intended value) are dropped so a seed run only reports
 * real changes. Pure — the caller writes the returned entries.
 *
 * A key conflicting with an existing translation is skipped: seeding
 * `home.greeting.formal` into a language whose `home.greeting` is still the
 * string "Witaj" cannot keep both, and quietly trading a real translation for a
 * placeholder is the one thing seeding must not do. `setKey`'s `overwrite: false`
 * cannot express this, because seeding *does* need to overwrite a placeholder
 * sitting at the key itself — so the conflict is decided by
 * {@link hasWriteConflict}, the same rule the write tools use.
 */
export function planSeed(
  mainFlat: { [key: string]: string },
  languageTree: TranslationTree,
  placeholder: string,
  copySource: boolean
): { key: string; value: string }[] {
  const languageFlat = flattenObject(languageTree);
  return findUntranslatedKeys(mainFlat, languageFlat, placeholder)
    .map((key) => ({ key, value: copySource ? mainFlat[key] : placeholder }))
    .filter((entry) => languageFlat[entry.key] !== entry.value)
    .filter((entry) => !hasWriteConflict(languageTree, entry.key));
}

/** One requested extraction: an exact text and the key to create for it. */
export interface ExtractionRequest {
  /** Exact hard-coded text to replace (as returned by the scan). */
  text: string;
  /** Dotted i18n key to create. */
  key: string;
}

/** Per-request outcome of {@link planFileExtractions} for a single template. */
export interface ExtractionOutcome {
  text: string;
  key: string;
  /** How many occurrences in this file were planned for replacement. */
  extracted: number;
  /** Parameter names bound from interpolations in the text, if any. */
  params?: string[];
}

/** The combined plan for one template plus each request's outcome. */
export interface FileExtractionResult {
  plan: PlannedExtraction[];
  outcomes: ExtractionOutcome[];
}

/**
 * Plans extracting several exact texts from one template's source in a single
 * pass. Each request replaces every occurrence of its exact text with a
 * `translate` pipe. Offsets already claimed by an earlier request are skipped, so
 * overlapping requests can never produce corrupt edits. Pure: the caller applies
 * the returned plan with {@link applyExtractionToText} and writes the file.
 */
export function planFileExtractions(
  source: string,
  requests: ExtractionRequest[],
  options: HardcodedStringOptions = {}
): FileExtractionResult {
  const candidates = findHardcodedStrings(source, options);
  const claimed = new Set<number>();
  const plan: PlannedExtraction[] = [];
  const outcomes: ExtractionOutcome[] = requests.map((request) => {
    const { value, params } = normalizeInterpolation(request.text);
    const snippet = interpolationSnippet(request.key, params);
    let extracted = 0;
    for (const candidate of candidates) {
      if (candidate.text !== request.text || claimed.has(candidate.index)) {
        continue;
      }
      claimed.add(candidate.index);
      plan.push({ index: candidate.index, length: candidate.length, text: value, key: request.key, snippet });
      extracted++;
    }
    return { text: request.text, key: request.key, extracted, params: params.map((param) => param.name) };
  });
  return { plan, outcomes };
}

/**
 * When an exact extraction target is not found, looks for a hard-coded candidate
 * that *contains* the requested text — typically an interpolated node
 * (`Errors, line {{ error.key }}`) that a plain scan reports whole. Lets the
 * extract tools answer "not an exact match, but it lives inside this node"
 * instead of a bare "not found". Returns `undefined` when an exact candidate
 * exists (so the caller extracts normally) or nothing contains the text.
 */
export function findContainingCandidate(
  source: string,
  text: string,
  options: HardcodedStringOptions = {}
): { containingText: string } | undefined {
  if (!text) {
    return undefined;
  }
  const candidates = findHardcodedStrings(source, options);
  if (candidates.some((candidate) => candidate.text === text)) {
    return undefined;
  }
  const containing = candidates.find((candidate) => candidate.text !== text && candidate.text.includes(text));
  return containing ? { containingText: containing.text } : undefined;
}

/** One key that still needs translating, with its main-language source text. */
export interface UntranslatedItem {
  /** Secondary language code the key is missing/placeholder in. */
  language: string;
  /** Dotted i18n key. */
  key: string;
  /** Main-language source text, or `null` when the key has no main-language value. */
  source: string | null;
}

/** How {@link shapeMissingTranslations} should shape its output. */
export interface ListMissingOptions {
  /** `true` (default) → counts only; `false` → paginated key/source detail. */
  summary?: boolean;
  /** Only keys equal to, or nested under, this dotted prefix. */
  prefix?: string;
  /** Only this secondary language code. */
  language?: string;
  /** Detail mode: maximum entries to return (default `100`). */
  limit?: number;
  /** Detail mode: entries to skip before returning, for pagination (default `0`). */
  offset?: number;
}

/** Counts-only view: safe to return on a large project without blowing context. */
export interface MissingSummary {
  mode: 'summary';
  /** Total untranslated entries across every language after filtering. */
  totalMissing: number;
  /** Per language: its total and a histogram of counts by top-level key prefix. */
  languages: { language: string; total: number; byPrefix: { prefix: string; count: number }[] }[];
}

/** Paginated detail view: the actual keys + source text to translate. */
export interface MissingDetail {
  mode: 'detail';
  /** Total entries matching the filter (before pagination). */
  total: number;
  offset: number;
  limit: number;
  /** How many entries this page returned. */
  returned: number;
  /** Whether more entries remain past this page. */
  hasMore: boolean;
  untranslated: UntranslatedItem[];
}

/** The top-level prefix of a dotted key (the segment before the first dot). */
const prefixOf = (key: string): string => {
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
};

/** Whether a key equals, or is nested under, the given dotted prefix. */
const underPrefix = (key: string, prefix: string): boolean =>
  key === prefix || key.startsWith(`${prefix}.`);

/**
 * Collects every key a secondary language still needs translated, with its
 * main-language source.
 *
 * This lives here, rather than in each surface, because "which keys need
 * translating" is the answer the agent acts on — and the two surfaces had drifted
 * on it: one asked `buildTranslationReport` (which diffs against the union of
 * *all* languages' keys, so a key only a stale secondary file still has came back
 * with `source: null`, asking the agent to translate text that does not exist),
 * the other asked `findUntranslatedKeys` (main-language keys only). Same project,
 * different counts, depending on which surface the agent happened to call.
 */
export function collectUntranslatedItems(
  languages: { language: string; tree: TranslationTree }[],
  mainLanguage: string,
  placeholder: string
): UntranslatedItem[] {
  const main = languages.find((entry) => entry.language === mainLanguage);
  const mainFlat = main ? flattenObject(main.tree) : {};
  return languages
    .filter((entry) => entry.language !== mainLanguage)
    .flatMap((entry) =>
      findUntranslatedKeys(mainFlat, flattenObject(entry.tree), placeholder).map((key) => ({
        language: entry.language,
        key,
        source: mainFlat[key] ?? null
      }))
    );
}

/**
 * Shapes a flat list of untranslated keys into either a compact summary (counts
 * + per-prefix histogram, the default — safe on large projects) or a paginated,
 * filtered detail list. Both surfaces collect via {@link collectUntranslatedItems}
 * and shape here, so behaviour stays identical.
 */
export function shapeMissingTranslations(
  items: UntranslatedItem[],
  options: ListMissingOptions = {}
): MissingSummary | MissingDetail {
  const filtered = items.filter(
    (item) =>
      (options.language === undefined || item.language === options.language) &&
      (options.prefix === undefined || underPrefix(item.key, options.prefix))
  );

  if (options.summary ?? true) {
    const byLanguage = new Map<string, Map<string, number>>();
    for (const item of filtered) {
      const prefixes = byLanguage.get(item.language) ?? new Map<string, number>();
      const prefix = prefixOf(item.key);
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
      byLanguage.set(item.language, prefixes);
    }
    const languages = [...byLanguage.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([language, prefixes]) => ({
        language,
        total: [...prefixes.values()].reduce((sum, count) => sum + count, 0),
        byPrefix: [...prefixes.entries()]
          .map(([prefix, count]) => ({ prefix, count }))
          .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
      }));
    return { mode: 'summary', totalMissing: filtered.length, languages };
  }

  const sorted = [...filtered].sort(
    (a, b) => a.language.localeCompare(b.language) || a.key.localeCompare(b.key)
  );
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit ?? 100);
  const page = sorted.slice(offset, offset + limit);
  return {
    mode: 'detail',
    total: sorted.length,
    offset,
    limit,
    returned: page.length,
    hasMore: offset + page.length < sorted.length,
    untranslated: page
  };
}
