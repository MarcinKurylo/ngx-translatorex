/**
 * Pure, VS Code-independent helpers for locating ngx-translate key references in
 * source text. Kept free of the `vscode` module so they can be unit-tested
 * directly; the provider maps the returned offsets to editor positions.
 */

/** A translation key reference found in source text. */
export interface TranslateKeyReference {
  /** The referenced key (e.g. `home.title`). */
  key: string;
  /** Offset of the key (without the surrounding quotes) in the source text. */
  index: number;
  /** Length of the key in characters. */
  length: number;
}

/**
 * The characters a translation key is read back with. This has to cover
 * everything `generateKey` can *produce*, or a key becomes invisible to every
 * consumer of {@link findTranslateKeys} — and an invisible key is not merely
 * unhelpful: `Clean unused i18n keys` classifies it as unused and offers it for
 * deletion, pre-selected. `generateKey` slugifies the selected text and does not
 * strip letters, so any non-ASCII UI copy ("Wyślij zgłoszenie" → `wyślij_zgłoszenie`)
 * lands here. Hence Unicode letters/digits rather than `A-Za-z0-9`.
 */
const KEY_CHARS = String.raw`[\p{L}\p{N}_.]+`;

/**
 * Matches a quoted key immediately followed by the `translate` pipe, e.g.
 * `'home.title' | translate` — including inside attribute bindings and with pipe
 * arguments. A lookahead keeps the match ending at the key so its offset is
 * simple to compute.
 */
const HTML_KEY = new RegExp(String.raw`(['"])(${KEY_CHARS})(?=\1\s*\|\s*translate)`, 'gu');

/**
 * Matches a `TranslateService` call with a string-literal key, e.g.
 * `this.translate.instant('home.title')` or `translateService.get('x')`. The
 * receiver must contain `translate` so generic `.get(...)` calls (Angular forms,
 * maps, HTTP) are not flagged.
 */
const TS_KEY = new RegExp(
  String.raw`\w*translate\w*\.(?:instant|get|stream)\(\s*(['"])(${KEY_CHARS})(?=\1)`,
  'giu'
);

/**
 * Finds every ngx-translate key referenced in the given text for the given
 * language, as `key`/`index`/`length` records. Only string-literal keys are
 * detected; dynamically built keys are ignored.
 */
export function findTranslateKeys(text: string, languageId: string): TranslateKeyReference[] {
  const pattern = languageId === 'html' ? HTML_KEY : languageId === 'typescript' ? TS_KEY : undefined;
  if (!pattern) {
    return [];
  }
  const references: TranslateKeyReference[] = [];
  for (const match of text.matchAll(pattern)) {
    const key = match[2];
    references.push({ key, index: match.index! + match[0].length - key.length, length: key.length });
  }
  return references;
}

/** A planned replacement of a key reference in source text. */
export interface ReferenceEdit {
  /** Offset of the key (without quotes) to replace. */
  index: number;
  /** Length of the existing key. */
  length: number;
  /** The text to write in its place. */
  replacement: string;
}

/**
 * Plans the edits needed to rewrite every reference to `oldKey` (or any key
 * nested under it) so it points at `newKey` instead. A namespace rename
 * (`home` → `landing`) rewrites `home.title` to `landing.title` by replacing only
 * the renamed prefix, leaving the suffix intact. Returns the edits as
 * offset/length/replacement records so the caller can map them to editor ranges.
 */
export function planReferenceRename(
  text: string,
  languageId: string,
  oldKey: string,
  newKey: string
): ReferenceEdit[] {
  const edits: ReferenceEdit[] = [];
  for (const ref of findTranslateKeys(text, languageId)) {
    if (ref.key === oldKey || ref.key.startsWith(`${oldKey}.`)) {
      edits.push({ index: ref.index, length: ref.length, replacement: newKey + ref.key.slice(oldKey.length) });
    }
  }
  return edits;
}
