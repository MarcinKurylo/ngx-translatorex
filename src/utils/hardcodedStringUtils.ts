/**
 * Pure, VS Code-independent detection of hard-coded (untranslated) user-facing
 * strings in Angular HTML templates. Kept free of the `vscode` module so it can
 * be unit-tested directly; the provider maps the returned offsets to editor
 * positions and diagnostics.
 *
 * The heuristic here is intentionally minimal — it is the infrastructure seam
 * the real detection quality will be tuned behind. It flags text nodes and a
 * small set of attributes (`title`, `placeholder`, `aria-label`) that contain a
 * letter and are not already an Angular binding, while skipping `<script>` /
 * `<style>` content, comments, and anything the ignore mechanisms exclude.
 */

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
const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label'];

/** Blocks whose content must never be scanned (masked out, offsets preserved). */
const MASKED_BLOCKS = /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi;

/** Text between two tags. The text itself never contains `<`. */
const TEXT_NODE = />([^<]+)</g;

/** A plain (non-bound) `title`/`placeholder`/`aria-label` attribute with a quoted value. */
const TEXT_ATTRIBUTE = new RegExp(`(?<=\\s)(?:${TEXT_ATTRIBUTES.join('|')})\\s*=\\s*(['"])(.*?)\\1`, 'g');

/** Marker that, on a candidate's line or the line above it, suppresses detection. */
const INLINE_IGNORE = 'i18n-ignore';

const hasLetter = (text: string): boolean =>
  /\p{L}/u.test(text.replace(/&[a-z]+;|&#\d+;/gi, ''));

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
    if (text.length < minLength || text.includes('{{') || !hasLetter(text)) {
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
    consider(match[1], match.index! + 1);
  }
  for (const match of masked.matchAll(TEXT_ATTRIBUTE)) {
    const valueOffset = match.index! + match[0].indexOf(match[1]) + 1;
    consider(match[2], valueOffset);
  }

  return candidates.sort((a, b) => a.index - b.index);
}
