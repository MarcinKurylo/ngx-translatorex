import * as assert from 'assert';
import {
  TranslationTree,
  buildTranslationCoverage,
  buildTranslationReport,
  checkForParamsInSelection,
  deleteKey,
  findKeyOffsetInJson,
  findUntranslatedKeys,
  flattenObject,
  generateKey,
  getNode,
  hasWriteConflict,
  isKeyValid,
  listKeyOffsets,
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

describe('listKeyOffsets', () => {
  const json = '{\n  "home": {\n    "title": "Home",\n    "welcome": "Welcome {{ name }}"\n  },\n  "common": {\n    "save": "Save"\n  }\n}\n';

  it('lists every leaf key with its dotted path and offset', () => {
    const keys = listKeyOffsets(json);
    assert.deepStrictEqual(keys.map((k) => k.key), ['home.title', 'home.welcome', 'common.save']);
    for (const { key, offset } of keys) {
      const leaf = key.split('.').pop();
      assert.strictEqual(json.slice(offset, offset + leaf!.length), leaf);
    }
  });

  it('does not list intermediate (object) keys', () => {
    const keys = listKeyOffsets(json).map((k) => k.key);
    assert.ok(!keys.includes('home'));
    assert.ok(!keys.includes('common'));
  });

  it('is not fooled by a value equal to a key name', () => {
    const keys = listKeyOffsets('{ "a": "save", "common": { "save": "Save" } }').map((k) => k.key);
    assert.deepStrictEqual(keys, ['a', 'common.save']);
  });

  it('returns an empty array for an empty object', () => {
    assert.deepStrictEqual(listKeyOffsets('{}'), []);
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

describe('buildTranslationCoverage', () => {
  it('reports each language as a percentage of the key union', () => {
    const coverage = buildTranslationCoverage([
      { language: 'en', tree: { home: { title: 'Home', welcome: 'Hi' }, common: { save: 'Save', cancel: 'Cancel' } } },
      { language: 'pl', tree: { home: { title: 'Start', welcome: 'Cześć' }, common: { save: 'Zapisz' } } },
      { language: 'de', tree: {} }
    ], PLACEHOLDER);
    const by = Object.fromEntries(coverage.map((c) => [c.language, c.percent]));
    assert.strictEqual(by.en, 100);
    assert.strictEqual(by.pl, 75); // 3 of 4 keys translated
    assert.strictEqual(by.de, 0);
  });

  it('counts placeholder values as untranslated', () => {
    const coverage = buildTranslationCoverage([
      { language: 'en', tree: { a: '1', b: '2' } },
      { language: 'pl', tree: { a: 'x', b: PLACEHOLDER } }
    ], PLACEHOLDER);
    assert.strictEqual(coverage.find((c) => c.language === 'pl')!.percent, 50);
  });

  it('reports 100% when there are no keys', () => {
    const coverage = buildTranslationCoverage([{ language: 'en', tree: {} }], PLACEHOLDER);
    assert.strictEqual(coverage[0].percent, 100);
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

  it('renames the placeholder at the given position, not the first identical one', () => {
    // Matching by text renamed the greeting and left the farewell alone —
    // exactly inverted, so each param bound to the wrong source expression.
    const result = renameParams('Hi {{ name }}, bye {{ name }}', ['', 'farewell']);
    assert.match(result, /^Hi \{\{ name \}\}, bye\s+\{\{ farewell \}\}\s*$/);
  });

  it('renames every position when a param repeats three times', () => {
    const result = renameParams('{{ x }} {{ x }} {{ x }}', ['a', 'b', 'c']);
    const names = [...result.matchAll(/\{\{ (\w+) \}\}/g)].map((match) => match[1]);
    assert.deepStrictEqual(names, ['a', 'b', 'c']);
  });

  it('keeps later placeholders correct when an earlier rename changes the length', () => {
    const result = renameParams('{{ a }} then {{ b }}', ['muchLongerName', 'second']);
    const names = [...result.matchAll(/\{\{ (\w+) \}\}/g)].map((match) => match[1]);
    assert.deepStrictEqual(names, ['muchLongerName', 'second']);
  });

  it('skips a falsy name without consuming that position', () => {
    const result = renameParams('{{ a }} {{ b }}', ['', 'renamed']);
    const names = [...result.matchAll(/\{\{ (\w+) \}\}/g)].map((match) => match[1]);
    assert.deepStrictEqual(names, ['a', 'renamed']);
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

describe('prototype-chain key safety', () => {
  // Agent tools name their own keys, so a key reaching the tree is untrusted
  // input. Walking into `__proto__` would assign onto every object in the
  // process (the extension host is shared with other extensions).
  afterEach(() => {
    delete (Object.prototype as any).polluted;
  });

  it('does not pollute Object.prototype through a __proto__ key', () => {
    const tree: TranslationTree = JSON.parse('{"a":{"b":"x"}}');
    setKey(tree, '__proto__.polluted', 'POLLUTED');
    assert.strictEqual(({} as any).polluted, undefined);
    assert.deepStrictEqual(tree, { a: { b: 'x' } });
  });

  it('reports a forbidden key as not written', () => {
    assert.deepStrictEqual(setKey({}, 'constructor.prototype.polluted', 'x'), {
      overwritten: false,
      written: false
    });
  });

  it('refuses every prototype-addressing segment, at any depth', () => {
    for (const key of ['__proto__.polluted', 'a.__proto__.polluted', 'constructor.polluted', 'a.prototype.polluted']) {
      const tree: TranslationTree = {};
      setKey(tree, key, 'POLLUTED');
      assert.strictEqual(({} as any).polluted, undefined, `leaked via ${key}`);
      assert.deepStrictEqual(tree, {}, `wrote a tree for ${key}`);
    }
  });

  it('does not pollute through setNode, which rename routes writes through', () => {
    setNode({}, '__proto__.polluted', 'POLLUTED');
    assert.strictEqual(({} as any).polluted, undefined);
  });

  it('does not resolve a prototype key to a node', () => {
    assert.strictEqual(getNode({ a: 'x' }, '__proto__'), undefined);
    assert.strictEqual(getNode({ a: 'x' }, 'constructor'), undefined);
  });

  it('does not report a prototype key as deleted', () => {
    assert.strictEqual(deleteKey({ a: 'x' }, '__proto__'), false);
  });

  it('rejects a prototype key in isKeyValid, in both modes', () => {
    assert.strictEqual(isKeyValid('__proto__.foo', 'key'), false);
    assert.strictEqual(isKeyValid('a.constructor', 'scope'), false);
    assert.strictEqual(isKeyValid('a.prototype.b', 'key'), false);
  });

  it('still allows keys that merely contain a forbidden word', () => {
    assert.strictEqual(isKeyValid('page.constructors', 'key'), true);
    assert.strictEqual(isKeyValid('my__proto__key', 'key'), true);
    const tree: TranslationTree = {};
    setKey(tree, 'page.constructors', 'Builders');
    assert.deepStrictEqual(tree, { page: { constructors: 'Builders' } });
  });
});

describe('setKey nesting under an existing leaf', () => {
  it('does not destroy a real translation when overwrite is false', () => {
    // The secondary-language sync path: adding `greeting.formal` must not cost
    // the translator the existing `greeting` value.
    const tree: TranslationTree = { greeting: 'Witaj' };
    const result = setKey(tree, 'greeting.formal', '[TODO]', { overwrite: false });
    assert.deepStrictEqual(result, { overwritten: false, written: false });
    assert.deepStrictEqual(tree, { greeting: 'Witaj' });
  });

  it('reports written false so the caller does not persist a no-op', () => {
    const tree: TranslationTree = { a: { b: 'kept' } };
    assert.strictEqual(setKey(tree, 'a.b.c', 'x', { overwrite: false }).written, false);
    assert.deepStrictEqual(tree, { a: { b: 'kept' } });
  });

  it('still nests normally when the segment is a subtree or absent', () => {
    const tree: TranslationTree = { greeting: { casual: 'Cześć' } };
    assert.strictEqual(setKey(tree, 'greeting.formal', '[TODO]', { overwrite: false }).written, true);
    assert.deepStrictEqual(tree, { greeting: { casual: 'Cześć', formal: '[TODO]' } });
  });

  it('reports overwritten when a leaf gives way to a subtree, so the user is warned', () => {
    // The only signal behind commands.ts's "Existing i18n key overwritten"
    // message; without it the main language drops a value in silence.
    const tree: TranslationTree = { greeting: 'Hello' };
    const result = setKey(tree, 'greeting.formal', 'Good day');
    assert.strictEqual(result.overwritten, true);
    assert.strictEqual(result.written, true);
  });

  it('does not claim an overwrite when nothing was replaced', () => {
    assert.strictEqual(setKey({}, 'greeting.formal', 'Good day').overwritten, false);
    assert.strictEqual(setKey({ greeting: {} }, 'greeting.formal', 'x').overwritten, false);
  });

  it('still replaces the leaf when overwrite is allowed', () => {
    const tree: TranslationTree = { greeting: 'Witaj' };
    assert.strictEqual(setKey(tree, 'greeting.formal', 'Dzień dobry').written, true);
    assert.deepStrictEqual(tree, { greeting: { formal: 'Dzień dobry' } });
  });
});

describe('generateKey punctuation', () => {
  it('strips a sentence-ending period instead of emitting a trailing dot', () => {
    assert.strictEqual(generateKey('home', 'Save your changes.'), 'home.save_your_changes');
  });

  it('produces a key that setKey stores as a leaf and isKeyValid accepts', () => {
    const key = generateKey('home', 'Save your changes.');
    assert.strictEqual(isKeyValid(key, 'key'), true);
    const tree: TranslationTree = {};
    setKey(tree, key, 'Save your changes.');
    assert.deepStrictEqual(tree, { home: { save_your_changes: 'Save your changes.' } });
  });

  it('collapses inner periods rather than nesting on them', () => {
    assert.strictEqual(generateKey('app', 'Version 1.2 released.'), 'app.version_1_2_released');
  });

  it('keeps treating other sentence punctuation the same way', () => {
    assert.strictEqual(generateKey('home', 'Saved!'), 'home.saved');
    assert.strictEqual(generateKey('home', 'Are you sure?'), 'home.are_you_sure');
  });
});

describe('hasWriteConflict', () => {
  it('detects an ancestor that already holds text', () => {
    assert.strictEqual(hasWriteConflict({ greeting: 'Witaj' }, 'greeting.formal'), true);
    assert.strictEqual(hasWriteConflict({ home: { greeting: 'Witaj' } }, 'home.greeting.formal'), true);
  });

  it('detects a key that is already a namespace', () => {
    assert.strictEqual(hasWriteConflict({ greeting: { formal: 'Dzień dobry' } }, 'greeting'), true);
  });

  it('allows a key nesting under an existing subtree', () => {
    assert.strictEqual(hasWriteConflict({ home: { casual: 'Cześć' } }, 'home.formal'), false);
  });

  it('allows a plain overwrite of a leaf at the key itself', () => {
    assert.strictEqual(hasWriteConflict({ greeting: 'Witaj' }, 'greeting'), false);
  });

  it('allows a brand new key, at any depth', () => {
    assert.strictEqual(hasWriteConflict({}, 'a.b.c'), false);
    assert.strictEqual(hasWriteConflict({ other: 'x' }, 'a.b.c'), false);
  });

  it('does not treat an empty subtree as a conflict', () => {
    assert.strictEqual(hasWriteConflict({ greeting: {} }, 'greeting'), false);
  });
});
