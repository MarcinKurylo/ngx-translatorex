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
 * Matches a quoted key immediately followed by the `translate` pipe, e.g.
 * `'home.title' | translate` — including inside attribute bindings and with pipe
 * arguments. A lookahead keeps the match ending at the key so its offset is
 * simple to compute.
 */
const HTML_KEY = /(['"])([A-Za-z0-9_.]+)(?=\1\s*\|\s*translate)/g;

/**
 * Matches a `TranslateService` call with a string-literal key, e.g.
 * `this.translate.instant('home.title')` or `translateService.get('x')`. The
 * receiver must contain `translate` so generic `.get(...)` calls (Angular forms,
 * maps, HTTP) are not flagged.
 */
const TS_KEY = /\w*translate\w*\.(?:instant|get|stream)\(\s*(['"])([A-Za-z0-9_.]+)(?=\1)/gi;

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
