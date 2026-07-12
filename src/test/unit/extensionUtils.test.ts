import * as assert from 'assert';
import { ExtensionUtils } from '../../utils/extensionUtils';

declare const global: any;
const setMode = (mode: 'key' | 'scope') => {
  global.__vscodeConfigStore['ngx-translatorex'].mode = mode;
};

describe('ExtensionUtils.flattenObject', () => {
  it('flattens a nested object into dot-separated keys', () => {
    const flat = ExtensionUtils.flattenObject({ a: { b: '1', c: { d: '2' } }, e: '3' });
    assert.deepStrictEqual(flat, { 'a.b': '1', 'a.c.d': '2', e: '3' });
  });

  it('returns an empty object for empty input', () => {
    assert.deepStrictEqual(ExtensionUtils.flattenObject({}), {});
  });
});

describe('ExtensionUtils.sortObject', () => {
  it('sorts keys alphabetically, case-insensitively', () => {
    const sorted = ExtensionUtils.sortObject({ Beta: '1', alpha: '2', Charlie: '3' });
    assert.deepStrictEqual(Object.keys(sorted), ['alpha', 'Beta', 'Charlie']);
  });

  it('sorts nested keys recursively and preserves values', () => {
    const sorted = ExtensionUtils.sortObject({ z: '1', a: { d: '4', c: '3' } });
    assert.deepStrictEqual(Object.keys(sorted), ['a', 'z']);
    assert.deepStrictEqual(Object.keys((sorted as any).a), ['c', 'd']);
    assert.strictEqual((sorted as any).a.d, '4');
  });
});

describe('ExtensionUtils.generateKey', () => {
  it('slugifies the value and appends it to the key (scope)', () => {
    assert.strictEqual(ExtensionUtils.generateKey('scope', 'Hello World!'), 'scope.hello_world');
  });

  it('collapses multiple underscores into a single one', () => {
    assert.strictEqual(ExtensionUtils.generateKey('s', 'a   b'), 's.a_b');
  });

  it('strips the trailing dot from the key', () => {
    assert.strictEqual(ExtensionUtils.generateKey('key.', 'ignored value'), 'key');
  });
});

describe('ExtensionUtils.splitParamNames', () => {
  it('splits the key from param names on the colon', () => {
    assert.deepStrictEqual(
      ExtensionUtils.splitParamNames('key1.key2:p1:p2'),
      ['key1.key2', ['p1', 'p2']]
    );
  });

  it('returns an empty param list when there are none', () => {
    assert.deepStrictEqual(ExtensionUtils.splitParamNames('key1.key2'), ['key1.key2', []]);
  });
});

describe('ExtensionUtils.checkForParamsInSelection', () => {
  it('finds all {{ ... }} occurrences', () => {
    const params = ExtensionUtils.checkForParamsInSelection('Hi {{ name }} and {{ age }}');
    assert.strictEqual(params.length, 2);
    assert.strictEqual(params[0][0], '{{ name }}');
    assert.strictEqual(params[1][0], '{{ age }}');
  });

  it('returns an empty array when there are no params', () => {
    assert.strictEqual(ExtensionUtils.checkForParamsInSelection('no params here').length, 0);
  });
});

describe('ExtensionUtils.renameParams', () => {
  it('replaces params by index with the given names', () => {
    const result = ExtensionUtils.renameParams('Hi {{ old }}', ['newName']);
    assert.ok(result.includes('{{ newName }}'));
    assert.ok(!result.includes('{{ old }}'));
  });

  it('leaves a param untouched when no new name is given for its index', () => {
    const result = ExtensionUtils.renameParams('Hi {{ one }} {{ two }}', ['first']);
    assert.ok(result.includes('{{ first }}'));
    assert.ok(result.includes('{{ two }}'));
  });
});

describe('ExtensionUtils.checkIfKeyValid', () => {
  it('rejects a key ending with a dot in key mode', () => {
    setMode('key');
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('a.b'), true);
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('a.'), false);
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('.a'), false);
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('a..b'), false);
  });

  it('allows a key ending with a dot in scope mode', () => {
    setMode('scope');
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('a.'), true);
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('.a'), false);
    assert.strictEqual(ExtensionUtils.checkIfKeyValid('a..b'), false);
  });
});
