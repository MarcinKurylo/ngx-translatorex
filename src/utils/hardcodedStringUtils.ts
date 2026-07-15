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

/** Where a hard-coded string was found: a template text node or an attribute value. */
export type HardcodedCategory = 'text' | 'attribute';

/**
 * Rough likelihood the candidate is genuine UI copy rather than a false
 * positive: `high` for attribute values and multi-word/interpolated text,
 * `low` for a single bare word (still worth flagging, more prone to noise).
 */
export type HardcodedConfidence = 'high' | 'low';

/** A candidate hard-coded string found in template source text. */
export interface HardcodedStringCandidate {
  /** The user-facing text (trimmed for text nodes, raw for attribute values). */
  text: string;
  /** Offset of the text in the source. */
  index: number;
  /** Length of the text in characters. */
  length: number;
  /**
   * One-based line number of the text. Resolved during detection, which has to
   * know the line anyway to honour the inline `i18n-ignore` marker.
   */
  line: number;
  /** Whether the text came from a text node or a user-facing attribute value. */
  category: HardcodedCategory;
  /** Rough confidence the candidate is real UI copy — lets a caller filter noise. */
  confidence: HardcodedConfidence;
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

/**
 * Builds a one-based line lookup for arbitrary offsets in the text, in a single
 * pass over it.
 *
 * The two match passes below scan the document independently, so offsets do not
 * arrive in order and a running counter will not do. Slicing the prefix per
 * candidate would, but it re-walks the document every time: a 20k-line template
 * with 1250 candidates took ~409ms that way against ~10ms here, and grew
 * quadratically — each doubling of the file quadrupled the scan.
 */
const lineLookup = (text: string): ((index: number) => number) => {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  return (index: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= index) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low + 1;
  };
};

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
  // Masking preserves every offset and newline, so a line resolved against the
  // masked text is the line in the original.
  const lineAt = lineLookup(masked);
  const candidates: HardcodedStringCandidate[] = [];

  const consider = (rawText: string, rawIndex: number, category: HardcodedCategory) => {
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
    const line = lineAt(index);
    // `ignoreLines` is zero-based; the marker counts on its own line or the one above.
    if (ignoreLines.has(line - 1) || ignoreLines.has(line - 2)) {
      return;
    }
    const confidence: HardcodedConfidence = category === 'attribute' || /\s/.test(text) ? 'high' : 'low';
    candidates.push({ text, index, length: text.length, line, category, confidence });
  };

  for (const match of masked.matchAll(TEXT_NODE)) {
    consider(match[1], match.index! + match[0].length - match[1].length, 'text');
  }
  for (const match of masked.matchAll(TEXT_ATTRIBUTE)) {
    const valueOffset = match.index! + match[0].indexOf(match[1]) + 1;
    consider(match[2], valueOffset, 'attribute');
  }

  return candidates.sort((a, b) => a.index - b.index);
}


/** A parameter binding derived from interpolated template text. */
export interface ExtractionParam {
  /** The `{{ name }}` placeholder used inside the i18n value. */
  name: string;
  /** The original template expression to bind to it. */
  expression: string;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Splits interpolated template text into an i18n value (with normalised
 * `{{ name }}` placeholders) and the params to bind. A simple identifier
 * expression keeps its own name; a complex one (`user.name`, `a + b`) gets a
 * generated `paramN` name. Repeated expressions reuse one name.
 */
export function normalizeInterpolation(text: string): { value: string; params: ExtractionParam[] } {
  const params: ExtractionParam[] = [];
  const nameByExpression = new Map<string, string>();
  const value = text.replace(/\{\{\s*(.*?)\s*\}\}/g, (_match, raw: string) => {
    const expression = raw.trim();
    let name = nameByExpression.get(expression);
    if (!name) {
      name = IDENTIFIER.test(expression) ? expression : `param${params.length + 1}`;
      nameByExpression.set(expression, name);
      params.push({ name, expression });
    }
    return `{{ ${name} }}`;
  });
  return { value, params };
}

/** Builds the `translate` pipe snippet for a key, binding any params (object shorthand when the name matches the expression). */
export function interpolationSnippet(key: string, params: ExtractionParam[]): string {
  if (!params.length) {
    return `{{ '${key}' | translate }}`;
  }
  const binding = params.map((param) => (param.name === param.expression ? param.name : `${param.name}: ${param.expression}`)).join(', ');
  return `{{ '${key}' | translate:{ ${binding} } }}`;
}

/** A single planned extraction: where to replace, the key to create, and the snippet. */
export interface PlannedExtraction {
  /** Offset of the text to replace in the source. */
  index: number;
  /** Length of the text to replace. */
  length: number;
  /** The i18n value for the new key (interpolations normalised to `{{ name }}`). */
  text: string;
  /** The generated dotted key. */
  key: string;
  /** The replacement snippet (`{{ 'key' | translate }}`, with param binding when needed). */
  snippet: string;
}

/**
 * Plans a bulk extraction of hard-coded strings into i18n keys under a scope
 * (empty scope → top-level keys). Keys are slugified from the text via
 * {@link generateKey}. Identical text reuses the same key (dedup); different text
 * that slugifies to the same key is disambiguated with a numeric suffix so no
 * value is ever overwritten. Interpolated text is extracted too — its `{{ expr }}`
 * tokens become `{{ name }}` in the stored value and are bound in the snippet.
 *
 * @returns One planned edit per replaceable occurrence, in source order.
 */
export function planBulkExtraction(candidates: HardcodedStringCandidate[], scope: string): PlannedExtraction[] {
  const keyToValue = new Map<string, string>();
  const plan: PlannedExtraction[] = [];
  for (const candidate of candidates) {
    const { value, params } = normalizeInterpolation(candidate.text);
    const base = generateKey(scope, candidate.text);
    let key = base;
    let suffix = 2;
    while (keyToValue.has(key) && keyToValue.get(key) !== value) {
      key = `${base}_${suffix++}`;
    }
    keyToValue.set(key, value);
    plan.push({
      index: candidate.index,
      length: candidate.length,
      text: value,
      key,
      snippet: interpolationSnippet(key, params)
    });
  }
  return plan;
}

/**
 * Applies a planned extraction to the source text, replacing each occurrence
 * with its snippet. Edits are applied from last to first so earlier offsets stay
 * valid. Pure, so it can back both an in-editor edit and a file-system write.
 */
export function applyExtractionToText(text: string, plan: PlannedExtraction[]): string {
  let result = text;
  for (const item of [...plan].sort((a, b) => b.index - a.index)) {
    result = result.slice(0, item.index) + item.snippet + result.slice(item.index + item.length);
  }
  return result;
}
