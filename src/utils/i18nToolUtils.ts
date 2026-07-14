/**
 * Pure, VS Code-independent helpers shared by the two agent surfaces — the
 * in-editor Language Model tools (`languageModelTools.ts`) and the standalone
 * MCP server (`mcp/src/i18n.ts`). Kept free of the `vscode` and `fs` modules so
 * the token-efficiency logic can be unit-tested directly.
 */

import {
  HardcodedStringOptions,
  PlannedExtraction,
  findHardcodedStrings,
  interpolationSnippet,
  normalizeInterpolation
} from './hardcodedStringUtils';

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
 * Shapes a flat list of untranslated keys into either a compact summary (counts
 * + per-prefix histogram, the default — safe on large projects) or a paginated,
 * filtered detail list. Both surfaces build the flat list their own way, then
 * defer the token-shaping here so behaviour stays identical.
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
