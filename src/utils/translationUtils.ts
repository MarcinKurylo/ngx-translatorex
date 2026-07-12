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
 * Validates a translation key for the given mode. A key may never start with a
 * dot or contain empty segments (`..`); in `key` mode it must also not end with
 * a dot (in `scope` mode a trailing dot is allowed, the slug is appended later).
 */
export function isKeyValid(key: string, mode: Mode): boolean {
  const base = !key.startsWith('.') && !key.includes('..');
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
 * (without the trailing dot).
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
  return `${scope}.${slug}`;
}
