/**
 * Pure, VS Code-independent detection of hard-coded (untranslated) user-facing
 * strings in Angular HTML templates. Kept free of the `vscode` module so it can
 * be unit-tested directly; the provider maps the returned offsets to editor
 * positions and diagnostics.
 *
 * It flags text nodes and a set of user-facing attributes (`title`,
 * `placeholder`, `aria-label`, `alt`, `matTooltip`) that contain a real word.
 * Text mixing static words with interpolations ("Hello {{ name }}") is kept
 * whole so the extraction flow can bind its params, while pure bindings, pure
 * numbers/symbols, single characters, code-like tokens (URLs, paths,
 * identifiers), `<script>`/`<style>` content, comments, and anything the ignore
 * mechanisms exclude are skipped.
 */

import { generateKey } from './translationUtils';

/** A candidate hard-coded string found in template source text. */
export interface HardcodedStringCandidate {
  /** The user-facing text (trimmed for text nodes, raw for attribute values). */
  text: string;
  /** Offset of the text in the source. */
  index: number;
  /** Length of the text in characters. */
  length: number;
}

/** Tuning options for {@link findHardcodedStrings}. */
export interface HardcodedStringOptions {
  /** Minimum trimmed length; shorter candidates are skipped. Defaults to `2`. */
  minLength?: number;
  /** Literal or `*`-glob patterns; matching text is skipped. */
  ignore?: string[];
}

/** Attributes whose literal values are treated as user-facing text. */
const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt', 'matTooltip'];

/** Blocks whose content must never be scanned (masked out, offsets preserved). */
const MASKED_BLOCKS = /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi;

/**
 * A run of text ending at a tag — either following a `>` or at the very start of
 * the document. The trailing `<` is matched via lookahead so it stays available
 * for the next text node. The text itself never contains `<`.
 */
const TEXT_NODE = /(?:^|>)([^<]+)(?=<)/g;

/** A plain (non-bound) `title`/`placeholder`/`aria-label` attribute with a quoted value. */
const TEXT_ATTRIBUTE = new RegExp(`(?<=\\s)(?:${TEXT_ATTRIBUTES.join('|')})\\s*=\\s*(['"])(.*?)\\1`, 'g');

/** Marker that, on a candidate's line or the line above it, suppresses detection. */
const INLINE_IGNORE = 'i18n-ignore';

/** An Angular interpolation binding within otherwise-static text. */
const INTERPOLATION = /\{\{[\s\S]*?\}\}/g;

/** HTML entities, stripped before the word check so `&nbsp;` etc. don't count as text. */
const ENTITY = /&[a-z]+;|&#\d+;/gi;

/**
 * Whether the text contains a real word — a run of at least two letters once
 * entities are removed. Filters out pure numbers, symbols, icons, single
 * characters and version-like tokens (`v2`, `×`, `42`).
 */
const hasWord = (text: string): boolean => /\p{L}{2,}/u.test(text.replace(ENTITY, ''));

/**
 * Whether a single-token string looks like code rather than prose — a URL, a
 * path, a snake_case / camelCase / dotted identifier, or a `#`/`@` reference —
 * so literal keys, routes and technical values are not flagged. Only applied to
 * whitespace-free text without interpolation, so real sentences never match.
 */
const looksTechnical = (token: string): boolean =>
  /:\/\//.test(token) ||
  /^\.{0,2}\//.test(token) ||
  /^[#@]/.test(token) ||
  token.includes('_') ||
  /\p{Ll}\p{Lu}/u.test(token) ||
  /\p{L}\.\p{L}/u.test(token);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchesIgnorePattern = (text: string, patterns: string[]): boolean =>
  patterns.some((pattern) =>
    pattern.includes('*')
      ? new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(text)
      : text === pattern
  );

/**
 * Replaces the content of masked blocks with spaces (newlines preserved) so
 * their length — and therefore every other offset in the document — is kept,
 * while nothing inside them can be detected.
 */
const maskBlocks = (html: string): string =>
  html.replace(MASKED_BLOCKS, (block) => block.replace(/[^\n]/g, ' '));

/** Zero-based line index of an offset in the given text. */
const lineOfOffset = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length - 1;

/** Lines (zero-based) that carry the inline-ignore marker. */
const ignoredLines = (html: string): Set<number> => {
  const lines = new Set<number>();
  html.split('\n').forEach((line, number) => {
    if (line.includes(INLINE_IGNORE)) {
      lines.add(number);
    }
  });
  return lines;
};

/**
 * Finds candidate hard-coded strings in an Angular HTML template. Only static,
 * user-facing text is returned; Angular bindings (`{{ ... }}`, `[attr]="..."`),
 * numbers, single characters, masked blocks, and text excluded by an ignore
 * pattern or an inline `i18n-ignore` marker are skipped.
 */
export function findHardcodedStrings(
  html: string,
  options: HardcodedStringOptions = {}
): HardcodedStringCandidate[] {
  const minLength = options.minLength ?? 2;
  const ignore = options.ignore ?? [];
  const ignoreLines = ignoredLines(html);
  const masked = maskBlocks(html);
  const candidates: HardcodedStringCandidate[] = [];

  const consider = (rawText: string, rawIndex: number) => {
    const leading = rawText.length - rawText.trimStart().length;
    const text = rawText.trim();
    const index = rawIndex + leading;
    // Static text with interpolations blanked out — a node that is only an
    // interpolation (`{{ user.name }}`, `{{ 'k' | translate }}`) has no static
    // word left and is skipped, while mixed text ("Hello {{ name }}") is kept
    // whole so the extraction flow can bind its params.
    const staticText = text.replace(INTERPOLATION, ' ');
    if (text.length < minLength || !hasWord(staticText)) {
      return;
    }
    const singleToken = !/\s/.test(text) && !text.includes('{{');
    if (singleToken && looksTechnical(text)) {
      return;
    }
    if (matchesIgnorePattern(text, ignore)) {
      return;
    }
    const line = lineOfOffset(masked, index);
    if (ignoreLines.has(line) || ignoreLines.has(line - 1)) {
      return;
    }
    candidates.push({ text, index, length: text.length });
  };

  for (const match of masked.matchAll(TEXT_NODE)) {
    consider(match[1], match.index! + match[0].length - match[1].length);
  }
  for (const match of masked.matchAll(TEXT_ATTRIBUTE)) {
    const valueOffset = match.index! + match[0].indexOf(match[1]) + 1;
    consider(match[2], valueOffset);
  }

  return candidates.sort((a, b) => a.index - b.index);
}

/** A hard-coded string candidate with its one-based line number in the source. */
export interface LocatedHardcodedString extends HardcodedStringCandidate {
  /** One-based line number of the candidate. */
  line: number;
}

/**
 * Like {@link findHardcodedStrings}, but also tags each candidate with its
 * one-based line number. Line numbers are computed in a single pass over the
 * text (candidates are already sorted by offset), so a whole-workspace scan
 * stays linear per file even when a template has many findings.
 */
export function locateHardcodedStrings(
  html: string,
  options: HardcodedStringOptions = {}
): LocatedHardcodedString[] {
  const candidates = findHardcodedStrings(html, options);
  const located: LocatedHardcodedString[] = [];
  let line = 1;
  let position = 0;
  for (const candidate of candidates) {
    while (position < candidate.index) {
      if (html.charCodeAt(position) === 10 /* \n */) {
        line++;
      }
      position++;
    }
    located.push({ ...candidate, line });
  }
  return located;
}

/** A single planned extraction: where to replace, the key to create, and the snippet. */
export interface PlannedExtraction {
  /** Offset of the text to replace in the source. */
  index: number;
  /** Length of the text to replace. */
  length: number;
  /** The original user-facing text (the value for the new key). */
  text: string;
  /** The generated dotted key. */
  key: string;
  /** The replacement snippet (`{{ 'key' | translate }}`). */
  snippet: string;
}

/**
 * Plans a bulk extraction of hard-coded strings into i18n keys under a scope
 * (empty scope → top-level keys). Keys are slugified from the text via
 * {@link generateKey}. Identical text reuses the same key (dedup); different text
 * that slugifies to the same key is disambiguated with a numeric suffix so no
 * value is ever overwritten. Candidates containing an interpolation are skipped
 * for now — binding their params during a bulk edit is out of scope.
 *
 * @returns One planned edit per replaceable occurrence, in source order.
 */
export function planBulkExtraction(candidates: HardcodedStringCandidate[], scope: string): PlannedExtraction[] {
  const keyToValue = new Map<string, string>();
  const plan: PlannedExtraction[] = [];
  for (const candidate of candidates) {
    if (candidate.text.includes('{{')) {
      continue;
    }
    const base = generateKey(scope, candidate.text);
    let key = base;
    let suffix = 2;
    while (keyToValue.has(key) && keyToValue.get(key) !== candidate.text) {
      key = `${base}_${suffix++}`;
    }
    keyToValue.set(key, candidate.text);
    plan.push({
      index: candidate.index,
      length: candidate.length,
      text: candidate.text,
      key,
      snippet: `{{ '${key}' | translate }}`
    });
  }
  return plan;
}
