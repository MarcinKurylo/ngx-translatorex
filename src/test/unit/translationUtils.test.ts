import * as assert from 'assert';
import {
  TranslationTree,
  buildTranslationReport,
  checkForParamsInSelection,
  deleteKey,
  findKeyOffsetInJson,
  findUntranslatedKeys,
  flattenObject,
  generateKey,
  getNode,
  isKeyValid,
  renameKey,
  renameParams,
  setKey,
  setNode,
  sortObject,
  splitParamNames
} from '../../utils/translationUtils';

const PLACEHOLDER = '[TODO] translation not implemented';

describe('flattenObject', () => {
  it('flattens a nested tree into dot-separated keys', () => {
    const flat = flattenObject({ a: { b: '1', c: { d: '2' } }, e: '3' });
    assert.deepStrictEqual(flat, { 'a.b': '1', 'a.c.d': '2', e: '3' });
  });

  it('returns an empty object for empty input', () => {
    assert.deepStrictEqual(flattenObject({}), {});
  });

  it('treats null and array values as leaves instead of recursing', () => {
    const flat = flattenObject({ a: null, b: ['x', 'y'], c: { d: '1' } } as any);
    assert.deepStrictEqual(flat, { a: null, b: ['x', 'y'], 'c.d': '1' } as any);
  });
});

describe('sortObject', () => {
  it('sorts keys alphabetically, case-insensitively', () => {
    const sorted = sortObject({ Beta: '1', alpha: '2', Charlie: '3' });
    assert.deepStrictEqual(Object.keys(sorted), ['alpha', 'Beta', 'Charlie']);
  });

  it('sorts nested keys recursively and preserves values', () => {
    const sorted = sortObject({ z: '1', a: { d: '4', c: '3' } });
    assert.deepStrictEqual(Object.keys(sorted), ['a', 'z']);
    assert.deepStrictEqual(Object.keys(sorted.a as TranslationTree), ['c', 'd']);
    assert.strictEqual((sorted.a as TranslationTree).d, '4');
  });
});

describe('setKey', () => {
  it('creates nested subtrees for a dotted key', () => {
    const tree: TranslationTree = {};
    const { overwritten } = setKey(tree, 'home.header.title', 'Hi');
    assert.deepStrictEqual(tree, { home: { header: { title: 'Hi' } } });
    assert.strictEqual(overwritten, false);
  });

  it('reports overwriting an existing string value', () => {
    const tree: TranslationTree = { home: { title: 'Old' } };
    const { overwritten } = setKey(tree, 'home.title', 'New');
    assert.strictEqual((tree.home as TranslationTree).title, 'New');
    assert.strictEqual(overwritten, true);
  });

  it('does not report overwriting when the leaf is new', () => {
    const tree: TranslationTree = { home: { title: 'X' } };
    const { overwritten } = setKey(tree, 'home.subtitle', 'Y');
    assert.strictEqual(overwritten, false);
  });

  it('reports whether the tree was written', () => {
    const tree: TranslationTree = {};
    assert.strictEqual(setKey(tree, 'a.b', 'v').written, true);
  });

  it('leaves an existing value untouched when overwrite is false', () => {
    const tree: TranslationTree = { home: { title: 'Start' } };
    const result = setKey(tree, 'home.title', 'placeholder', { overwrite: false });
    assert.strictEqual((tree.home as TranslationTree).title, 'Start');
    assert.deepStrictEqual(result, { overwritten: false, written: false });
  });

  it('fills a missing key when overwrite is false', () => {
    const tree: TranslationTree = { home: { title: 'Start' } };
    const result = setKey(tree, 'home.subtitle', 'placeholder', { overwrite: false });
    assert.strictEqual((tree.home as TranslationTree).subtitle, 'placeholder');
    assert.strictEqual(result.written, true);
  });
});

describe('getNode', () => {
  it('returns a leaf value', () => {
    assert.strictEqual(getNode({ home: { title: 'Home' } }, 'home.title'), 'Home');
  });

  it('returns a subtree', () => {
    assert.deepStrictEqual(getNode({ home: { title: 'Home' } }, 'home'), { title: 'Home' });
  });

  it('returns undefined for a missing key', () => {
    assert.strictEqual(getNode({ home: { title: 'Home' } }, 'home.missing'), undefined);
    assert.strictEqual(getNode({ home: 'x' }, 'home.title'), undefined);
  });
});

describe('setNode', () => {
  it('stores a subtree, creating intermediate objects', () => {
    const tree: TranslationTree = {};
    setNode(tree, 'a.b', { c: '1' });
    assert.deepStrictEqual(tree, { a: { b: { c: '1' } } });
  });
});

describe('deleteKey', () => {
  it('removes a leaf and prunes empty parents', () => {
    const tree: TranslationTree = { home: { title: 'Home' }, common: { save: 'Save' } };
    assert.strictEqual(deleteKey(tree, 'home.title'), true);
    assert.deepStrictEqual(tree, { common: { save: 'Save' } });
  });

  it('keeps parents that still have siblings', () => {
    const tree: TranslationTree = { home: { title: 'Home', welcome: 'Hi' } };
    deleteKey(tree, 'home.title');
    assert.deepStrictEqual(tree, { home: { welcome: 'Hi' } });
  });

  it('removes a whole subtree', () => {
    const tree: TranslationTree = { home: { title: 'Home' }, common: { save: 'Save' } };
    assert.strictEqual(deleteKey(tree, 'home'), true);
    assert.deepStrictEqual(tree, { common: { save: 'Save' } });
  });

  it('returns false for a missing key', () => {
    const tree: TranslationTree = { home: { title: 'Home' } };
    assert.strictEqual(deleteKey(tree, 'home.missing'), false);
    assert.strictEqual(deleteKey(tree, 'nope'), false);
    assert.deepStrictEqual(tree, { home: { title: 'Home' } });
  });
});

describe('renameKey', () => {
  it('renames a leaf, moving its value', () => {
    const tree: TranslationTree = { home: { title: 'Home' } };
    assert.strictEqual(renameKey(tree, 'home.title', 'home.header'), true);
    assert.deepStrictEqual(tree, { home: { header: 'Home' } });
  });

  it('moves a value to a new nested path and prunes the old branch', () => {
    const tree: TranslationTree = { home: { title: 'Home' } };
    renameKey(tree, 'home.title', 'page.heading');
    assert.deepStrictEqual(tree, { page: { heading: 'Home' } });
  });

  it('renames a whole subtree', () => {
    const tree: TranslationTree = { home: { title: 'Home', welcome: 'Hi' } };
    renameKey(tree, 'home', 'landing');
    assert.deepStrictEqual(tree, { landing: { title: 'Home', welcome: 'Hi' } });
  });

  it('returns false when the source key does not exist or is unchanged', () => {
    const tree: TranslationTree = { home: { title: 'Home' } };
    assert.strictEqual(renameKey(tree, 'missing', 'x'), false);
    assert.strictEqual(renameKey(tree, 'home.title', 'home.title'), false);
    assert.deepStrictEqual(tree, { home: { title: 'Home' } });
  });
});

describe('findKeyOffsetInJson', () => {
  const json = '{\n  "home": {\n    "title": "Home",\n    "welcome": "Welcome {{ name }}"\n  },\n  "common": {\n    "save": "Save"\n  }\n}\n';

  it('finds the offset of a nested leaf key name', () => {
    const offset = findKeyOffsetInJson(json, 'home.title');
    assert.strictEqual(json.slice(offset!, offset! + 5), 'title');
  });

  it('finds an intermediate (object) key', () => {
    const offset = findKeyOffsetInJson(json, 'common');
    assert.strictEqual(json.slice(offset!, offset! + 6), 'common');
  });

  it('is not fooled by a value that matches a key name', () => {
    const tricky = '{\n  "a": "save",\n  "common": {\n    "save": "Save"\n  }\n}';
    const offset = findKeyOffsetInJson(tricky, 'common.save');
    // must resolve inside "common", not the "save" value string on the "a" line
    assert.ok(offset! > tricky.indexOf('"common"'));
  });

  it('returns undefined for a missing key', () => {
    assert.strictEqual(findKeyOffsetInJson(json, 'home.missing'), undefined);
  });
});

describe('findUntranslatedKeys', () => {
  const main = { 'home.title': 'Home', 'home.welcome': 'Hi', 'common.save': 'Save' };

  it('includes keys missing from a stub language file', () => {
    // pl has only one key — the rest are missing and must be caught
    const pl = { 'home.title': 'Start' };
    assert.deepStrictEqual(
      findUntranslatedKeys(main, pl, PLACEHOLDER).sort(),
      ['common.save', 'home.welcome']
    );
  });

  it('includes keys still holding the placeholder', () => {
    const pl = { 'home.title': 'Start', 'home.welcome': PLACEHOLDER, 'common.save': 'Zapisz' };
    assert.deepStrictEqual(findUntranslatedKeys(main, pl, PLACEHOLDER), ['home.welcome']);
  });

  it('excludes keys already translated', () => {
    const pl = { 'home.title': 'Start', 'home.welcome': 'Cześć', 'common.save': 'Zapisz' };
    assert.deepStrictEqual(findUntranslatedKeys(main, pl, PLACEHOLDER), []);
  });

  it('excludes keys whose main value is itself the placeholder (nothing to translate from)', () => {
    assert.deepStrictEqual(findUntranslatedKeys({ 'a.b': PLACEHOLDER }, {}, PLACEHOLDER), []);
  });

  it('returns everything for a totally empty language file', () => {
    assert.deepStrictEqual(findUntranslatedKeys(main, {}, PLACEHOLDER).sort(), ['common.save', 'home.title', 'home.welcome']);
  });
});

describe('buildTranslationReport', () => {
  it('reports keys missing from a language relative to the union', () => {
    const report = buildTranslationReport([
      { language: 'en', tree: { home: { title: 'Home', welcome: 'Hi' } } },
      { language: 'pl', tree: { home: { title: 'Start' } } }
    ], PLACEHOLDER);

    const pl = report.find((r) => r.language === 'pl')!;
    assert.deepStrictEqual(pl.missing, ['home.welcome']);
    assert.deepStrictEqual(pl.untranslated, []);
  });

  it('reports keys still holding the placeholder as untranslated', () => {
    const report = buildTranslationReport([
      { language: 'en', tree: { home: { title: 'Home' } } },
      { language: 'pl', tree: { home: { title: PLACEHOLDER } } }
    ], PLACEHOLDER);

    const pl = report.find((r) => r.language === 'pl')!;
    assert.deepStrictEqual(pl.untranslated, ['home.title']);
    assert.deepStrictEqual(pl.missing, []);
  });

  it('reports empty arrays for a fully translated language', () => {
    const report = buildTranslationReport([
      { language: 'en', tree: { home: { title: 'Home' } } },
      { language: 'pl', tree: { home: { title: 'Start' } } }
    ], PLACEHOLDER);

    const en = report.find((r) => r.language === 'en')!;
    assert.deepStrictEqual(en.missing, []);
    assert.deepStrictEqual(en.untranslated, []);
  });

  it('sorts reported keys for stable output', () => {
    const report = buildTranslationReport([
      { language: 'en', tree: { z: 'Z', a: 'A', m: 'M' } },
      { language: 'pl', tree: {} }
    ], PLACEHOLDER);

    assert.deepStrictEqual(report.find((r) => r.language === 'pl')!.missing, ['a', 'm', 'z']);
  });
});

describe('generateKey', () => {
  it('slugifies the value and appends it to the scope', () => {
    assert.strictEqual(generateKey('scope', 'Hello World!'), 'scope.hello_world');
  });

  it('collapses whitespace and specials into single underscores', () => {
    assert.strictEqual(generateKey('s', 'a   b'), 's.a_b');
  });

  it('returns a bare slug (no leading dot) for an empty scope', () => {
    assert.strictEqual(generateKey('', 'Welcome home'), 'welcome_home');
  });

  it('strips the trailing dot from the scope', () => {
    assert.strictEqual(generateKey('key.', 'ignored value'), 'key');
  });
});

describe('splitParamNames', () => {
  it('splits the key from param names on the colon', () => {
    assert.deepStrictEqual(splitParamNames('key1.key2:p1:p2'), ['key1.key2', ['p1', 'p2']]);
  });

  it('returns an empty param list when there are none', () => {
    assert.deepStrictEqual(splitParamNames('key1.key2'), ['key1.key2', []]);
  });
});

describe('checkForParamsInSelection', () => {
  it('finds all {{ ... }} occurrences', () => {
    const params = checkForParamsInSelection('Hi {{ name }} and {{ age }}');
    assert.strictEqual(params.length, 2);
    assert.strictEqual(params[0][0], '{{ name }}');
    assert.strictEqual(params[1][0], '{{ age }}');
  });

  it('returns an empty array when there are no params', () => {
    assert.strictEqual(checkForParamsInSelection('no params here').length, 0);
  });
});

describe('renameParams', () => {
  it('replaces params by index with the given names', () => {
    const result = renameParams('Hi {{ old }}', ['newName']);
    assert.ok(result.includes('{{ newName }}'));
    assert.ok(!result.includes('{{ old }}'));
  });

  it('leaves a param untouched when no new name is given for its index', () => {
    const result = renameParams('Hi {{ one }} {{ two }}', ['first']);
    assert.ok(result.includes('{{ first }}'));
    assert.ok(result.includes('{{ two }}'));
  });
});

describe('isKeyValid', () => {
  it('rejects a key ending with a dot in key mode', () => {
    assert.strictEqual(isKeyValid('a.b', 'key'), true);
    assert.strictEqual(isKeyValid('a.', 'key'), false);
    assert.strictEqual(isKeyValid('.a', 'key'), false);
    assert.strictEqual(isKeyValid('a..b', 'key'), false);
  });

  it('allows a key ending with a dot in scope mode', () => {
    assert.strictEqual(isKeyValid('a.', 'scope'), true);
    assert.strictEqual(isKeyValid('.a', 'scope'), false);
    assert.strictEqual(isKeyValid('a..b', 'scope'), false);
  });
});
