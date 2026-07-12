import * as assert from 'assert';
import {
  TranslationTree,
  checkForParamsInSelection,
  flattenObject,
  generateKey,
  isKeyValid,
  renameParams,
  setKey,
  sortObject,
  splitParamNames
} from '../../utils/translationUtils';

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
});

describe('generateKey', () => {
  it('slugifies the value and appends it to the scope', () => {
    assert.strictEqual(generateKey('scope', 'Hello World!'), 'scope.hello_world');
  });

  it('collapses whitespace and specials into single underscores', () => {
    assert.strictEqual(generateKey('s', 'a   b'), 's.a_b');
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
