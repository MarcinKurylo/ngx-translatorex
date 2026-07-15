/**
 * Pure, VS Code-independent helpers for manipulating i18n translation trees.
 * Keeping these free of the `vscode` module lets them be unit-tested directly,
 * without stubbing the editor API.
 */

/** A nested translation object: each value is either a string leaf or a subtree. */
export type TranslationTree = { [key: string]: string | TranslationTree };

/** Extension mode: `key` uses the entered key verbatim, `scope` derives a slug. */
export type Mode = 'key' | 'scope';

const isSubtree = (value: unknown): value is TranslationTree =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Key segments that address the prototype chain rather than a translation.
 * Walking into one turns a write into prototype pollution: `tree['__proto__']`
 * yields `Object.prototype`, which `isSubtree` accepts as a subtree, so a key
 * like `__proto__.foo` would assign onto every object in the process.
 */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Whether a dotted key is safe to walk. Keys reach the tree from agent tools
 * (which name keys themselves) as well as from typed input, so this is enforced
 * in the tree helpers rather than at each call site.
 */
const isSafeKey = (key: string): boolean =>
  !key.split('.').some((segment) => FORBIDDEN_SEGMENTS.has(segment));

/**
 * Validates a translation key for the given mode. A key may never start with a
 * dot, contain empty segments (`..`), or address the prototype chain; in `key`
 * mode it must also not end with a dot (in `scope` mode a trailing dot is
 * allowed, the slug is appended later).
 */
export function isKeyValid(key: string, mode: Mode): boolean {
  const base = !key.startsWith('.') && !key.includes('..') && isSafeKey(key);
  return mode === 'key' ? base && !key.endsWith('.') : base;
}

/**
 * Inserts a value into a nested tree under a dotted key, creating any missing
 * intermediate subtrees. Mutates `tree` in place.
 *
 * When `options.overwrite` is `false`, an existing value at the key is left
 * untouched (used for secondary language files, so real translations are never
 * replaced with a placeholder).
 *
 * @returns `overwritten` — whether an existing value was replaced; `written` —
 * whether the tree was actually modified.
 */
export function setKey(
  tree: TranslationTree,
  key: string,
  value: string,
  options: { overwrite?: boolean } = {}
): { overwritten: boolean; written: boolean } {
  if (!isSafeKey(key)) {
    return { overwritten: false, written: false };
  }
  const overwrite = options.overwrite ?? true;
  const [head, ...rest] = key.split('.');
  if (rest.length === 0) {
    const existing = tree[head];
    const overwritten =
      typeof existing === 'string' || (isSubtree(existing) && Object.keys(existing).length > 0);
    if (!overwrite && existing !== undefined) {
      return { overwritten: false, written: false };
    }
    tree[head] = value;
    return { overwritten, written: true };
  }
  const child = tree[head];
  const subtree: TranslationTree = isSubtree(child) ? child : {};
  tree[head] = subtree;
  return setKey(subtree, rest.join('.'), value, options);
}

/**
 * Returns the node stored under a dotted key — either a string leaf or a whole
 * subtree — or `undefined` when the key does not exist.
 */
export function getNode(tree: TranslationTree, key: string): string | TranslationTree | undefined {
  if (!isSafeKey(key)) {
    return undefined;
  }
  const [head, ...rest] = key.split('.');
  const child = tree[head];
  if (rest.length === 0) {
    return child;
  }
  return isSubtree(child) ? getNode(child, rest.join('.')) : undefined;
}

/**
 * Stores a node (a string leaf or an entire subtree) under a dotted key,
 * creating any missing intermediate subtrees. Mutates `tree` in place and
 * overwrites whatever is currently at the key. Used by rename to move a value
 * without discarding nested content.
 */
export function setNode(tree: TranslationTree, key: string, node: string | TranslationTree): void {
  if (!isSafeKey(key)) {
    return;
  }
  const [head, ...rest] = key.split('.');
  if (rest.length === 0) {
    tree[head] = node;
    return;
  }
  const child = tree[head];
  const subtree: TranslationTree = isSubtree(child) ? child : {};
  tree[head] = subtree;
  setNode(subtree, rest.join('.'), node);
}

/**
 * Removes the node at a dotted key, pruning any intermediate subtrees that are
 * left empty by the removal. Mutates `tree` in place.
 *
 * @returns `true` when a node was removed, `false` when the key did not exist.
 */
export function deleteKey(tree: TranslationTree, key: string): boolean {
  if (!isSafeKey(key)) {
    return false;
  }
  const [head, ...rest] = key.split('.');
  if (!(head in tree)) {
    return false;
  }
  if (rest.length === 0) {
    delete tree[head];
    return true;
  }
  const child = tree[head];
  if (!isSubtree(child)) {
    return false;
  }
  const deleted = deleteKey(child, rest.join('.'));
  if (deleted && Object.keys(child).length === 0) {
    delete tree[head];
  }
  return deleted;
}

/**
 * Renames a dotted key, moving whatever node it holds (leaf or subtree) to the
 * new key and pruning any subtrees emptied by the move. Mutates `tree` in place.
 *
 * @returns `true` when the source key existed and was moved, `false` otherwise.
 */
export function renameKey(tree: TranslationTree, oldKey: string, newKey: string): boolean {
  if (oldKey === newKey) {
    return false;
  }
  const node = getNode(tree, oldKey);
  if (node === undefined) {
    return false;
  }
  deleteKey(tree, oldKey);
  setNode(tree, newKey, node);
  return true;
}

/**
 * Locates a dotted key within raw JSON source text and returns the character
 * offset of the key name (just after its opening quote), so an editor can jump
 * to and select it. Walks the JSON structurally — tracking object nesting and
 * skipping string values — so a value that happens to equal a key name is not
 * mistaken for one. Assumes object/leaf translation JSON (no arrays).
 *
 * @returns The offset of the matching key name, or `undefined` when not found.
 */
export function findKeyOffsetInJson(text: string, dottedKey: string): number | undefined {
  const path: string[] = [];
  let pendingKey: string | undefined;
  let pendingKeyOffset = -1;
  let awaitingValue = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const start = i + 1;
      let j = start;
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1;
      }
      if (awaitingValue) {
        awaitingValue = false;
        pendingKey = undefined;
      } else {
        pendingKey = text.slice(start, j);
        pendingKeyOffset = start;
      }
      i = j + 1;
      continue;
    }
    if (ch === ':') {
      if (pendingKey !== undefined && [...path, pendingKey].join('.') === dottedKey) {
        return pendingKeyOffset;
      }
      awaitingValue = true;
    } else if (ch === '{') {
      if (pendingKey !== undefined) {
        path.push(pendingKey);
      }
      pendingKey = undefined;
      awaitingValue = false;
    } else if (ch === '}') {
      path.pop();
      pendingKey = undefined;
      awaitingValue = false;
    } else if (ch === ',') {
      pendingKey = undefined;
      awaitingValue = false;
    }
    i++;
  }
  return undefined;
}

/**
 * Enumerates every leaf key (one whose value is a string, not a nested object)
 * in raw JSON source text, with its dotted path and the character offset of the
 * key name. Walks the JSON structurally, so a value that equals a key name is not
 * mistaken for one. Assumes object/leaf translation JSON (no arrays).
 */
export function listKeyOffsets(text: string): { key: string; offset: number }[] {
  const keys: { key: string; offset: number }[] = [];
  const path: string[] = [];
  let pendingKey: string | undefined;
  let pendingKeyOffset = -1;
  let awaitingValue = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const start = i + 1;
      let j = start;
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1;
      }
      if (awaitingValue) {
        awaitingValue = false;
        pendingKey = undefined;
      } else {
        pendingKey = text.slice(start, j);
        pendingKeyOffset = start;
      }
      i = j + 1;
      continue;
    }
    if (ch === ':') {
      awaitingValue = true;
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) {
        next++;
      }
      if (pendingKey !== undefined && text[next] !== '{') {
        keys.push({ key: [...path, pendingKey].join('.'), offset: pendingKeyOffset });
      }
    } else if (ch === '{') {
      if (pendingKey !== undefined) {
        path.push(pendingKey);
      }
      pendingKey = undefined;
      awaitingValue = false;
    } else if (ch === '}') {
      path.pop();
      pendingKey = undefined;
      awaitingValue = false;
    } else if (ch === ',') {
      pendingKey = undefined;
      awaitingValue = false;
    }
    i++;
  }
  return keys;
}

/**
 * Flattens a nested tree into a single-level map keyed by dotted paths
 * (e.g. `{ a: { b: 'x' } }` → `{ 'a.b': 'x' }`). Non-subtree values (strings,
 * and any null/array values present in raw JSON) are treated as leaves.
 */
export function flattenObject(tree: TranslationTree, prefix = ''): { [key: string]: string } {
  const flat: { [key: string]: string } = {};
  for (const key of Object.keys(tree)) {
    const value = tree[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSubtree(value)) {
      Object.assign(flat, flattenObject(value, path));
    } else {
      flat[path] = value as string;
    }
  }
  return flat;
}

/**
 * Returns a deep copy of the tree with keys sorted alphabetically
 * (case-insensitive) at every level.
 */
export function sortObject(tree: TranslationTree): TranslationTree {
  const sorted: TranslationTree = {};
  const keys = Object.keys(tree).sort((a, b) =>
    a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())
  );
  for (const key of keys) {
    const value = tree[key];
    sorted[key] = isSubtree(value) ? sortObject(value) : value;
  }
  return sorted;
}

/** Per-language summary of keys that still need attention across the i18n folder. */
export interface LanguageReport {
  /** The language code (i18n file name without the `.json` extension). */
  language: string;
  /** Keys present in some other language but absent from this one. */
  missing: string[];
  /** Keys present in this language but still holding the placeholder value. */
  untranslated: string[];
}

/**
 * Compares every language's flattened keys against the union of all keys and
 * reports, per language, which keys are missing entirely and which still hold
 * the placeholder value (i.e. were synced but never translated). Keys are
 * returned sorted for stable output.
 */
export function buildTranslationReport(
  languages: { language: string; tree: TranslationTree }[],
  placeholder: string
): LanguageReport[] {
  const flattened = languages.map((entry) => ({
    language: entry.language,
    keys: flattenObject(entry.tree)
  }));
  const allKeys = new Set<string>();
  for (const entry of flattened) {
    Object.keys(entry.keys).forEach((key) => allKeys.add(key));
  }
  const sortedKeys = [...allKeys].sort();
  return flattened.map((entry) => ({
    language: entry.language,
    missing: sortedKeys.filter((key) => !(key in entry.keys)),
    untranslated: sortedKeys.filter((key) => entry.keys[key] === placeholder)
  }));
}

/**
 * Computes the translation coverage of each language as a rounded percentage of
 * the union of all keys: keys that are present and not the placeholder. A
 * language with the full key set and no placeholders is 100%.
 */
export function buildTranslationCoverage(
  languages: { language: string; tree: TranslationTree }[],
  placeholder: string
): { language: string; percent: number }[] {
  const total = new Set<string>();
  for (const entry of languages) {
    Object.keys(flattenObject(entry.tree)).forEach((key) => total.add(key));
  }
  const size = total.size;
  return buildTranslationReport(languages, placeholder).map((report) => ({
    language: report.language,
    percent: size ? Math.round(((size - report.missing.length - report.untranslated.length) / size) * 100) : 100
  }));
}

/**
 * Returns the keys of a secondary language that still need translating from the
 * main language: keys whose main-language value is a real string (not the
 * placeholder) and which are either absent from the language or still hold the
 * placeholder. Covers both a hand-made stub file (missing keys) and keys synced
 * as `[TODO]` placeholders.
 */
export function findUntranslatedKeys(
  mainFlat: { [key: string]: string },
  languageFlat: { [key: string]: string },
  placeholder: string
): string[] {
  return Object.keys(mainFlat).filter((key) => {
    const source = mainFlat[key];
    if (typeof source !== 'string' || source === placeholder) {
      return false;
    }
    const current = languageFlat[key];
    return current === undefined || current === placeholder;
  });
}

/**
 * Splits a user-provided key of the form `key:param1:param2` into the key and
 * the list of custom parameter names to apply to the selection's params.
 */
export function splitParamNames(key: string): [string, string[]] {
  const [newKey, ...paramNames] = key.split(':');
  return [newKey, paramNames];
}

/** Finds every interpolation placeholder (`{{ ... }}`) in the given text. */
export function checkForParamsInSelection(selection: string): RegExpMatchArray[] {
  return [...selection.matchAll(/{{.*?}}/g)];
}

/**
 * Renames interpolation placeholders in the text by position. Placeholders
 * without a corresponding new name are left unchanged.
 */
export function renameParams(selection: string, paramNames: string[]): string {
  const params = checkForParamsInSelection(selection);
  params.forEach((param, id) => {
    if (paramNames[id]) {
      selection = selection.replace(param[0], ` {{ ${paramNames[id]} }} `);
    }
  });
  return selection;
}

/**
 * Builds a full key in `scope` mode by appending a slug derived from the
 * selected text to the scope: special characters and whitespace become single
 * underscores. When the scope already ends with a dot it is returned as-is
 * (without the trailing dot); an empty scope yields the bare slug (top-level
 * key, no leading dot).
 */
export function generateKey(scope: string, value: string): string {
  if (scope.endsWith('.')) {
    return scope.slice(0, -1);
  }
  const slug = value
    .toLocaleLowerCase()
    .replace(/[`~!@#$%^&*()_|+\-=?;:{}'",<>\{\}\[\]\\\/]/gi, ' ')
    .trim()
    .split(/\s+/)
    .join('_');
  return scope ? `${scope}.${slug}` : slug;
}
