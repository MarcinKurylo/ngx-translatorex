import * as assert from 'assert';
import { findTranslateKeys } from '../../utils/diagnosticsUtils';

describe('findTranslateKeys (html)', () => {
  it('finds a key in a translate pipe interpolation', () => {
    const text = `<p>{{ 'home.title' | translate }}</p>`;
    const refs = findTranslateKeys(text, 'html');
    assert.deepStrictEqual(refs, [{ key: 'home.title', index: text.indexOf('home.title'), length: 'home.title'.length }]);
  });

  it('finds a key inside an attribute binding', () => {
    const text = `<input [placeholder]="'form.name' | translate">`;
    const refs = findTranslateKeys(text, 'html');
    assert.deepStrictEqual(refs.map((r) => r.key), ['form.name']);
    assert.strictEqual(refs[0].index, text.indexOf('form.name'));
  });

  it('finds a key when the pipe has arguments', () => {
    const text = `{{ 'home.welcome' | translate: { name: user } }}`;
    assert.deepStrictEqual(findTranslateKeys(text, 'html').map((r) => r.key), ['home.welcome']);
  });

  it('finds multiple keys in one document', () => {
    const text = `{{ 'a.b' | translate }} {{ 'c.d' | translate }}`;
    assert.deepStrictEqual(findTranslateKeys(text, 'html').map((r) => r.key), ['a.b', 'c.d']);
  });

  it('ignores quoted strings without the translate pipe', () => {
    assert.deepStrictEqual(findTranslateKeys(`{{ 'home.title' }}`, 'html'), []);
  });
});

describe('findTranslateKeys (typescript)', () => {
  it('finds a key in translate.instant', () => {
    const text = `const label = this.translate.instant('home.title');`;
    const refs = findTranslateKeys(text, 'typescript');
    assert.deepStrictEqual(refs.map((r) => r.key), ['home.title']);
    assert.strictEqual(refs[0].index, text.indexOf('home.title'));
  });

  it('finds keys in translate.get and translateService.stream', () => {
    const text = `this.translate.get('a.b'); translateService.stream('c.d');`;
    assert.deepStrictEqual(findTranslateKeys(text, 'typescript').map((r) => r.key), ['a.b', 'c.d']);
  });

  it('does not flag generic .get calls (forms, maps, http)', () => {
    const text = `this.form.get('name'); map.get('key'); http.get('/api');`;
    assert.deepStrictEqual(findTranslateKeys(text, 'typescript'), []);
  });

  it('ignores dynamically built keys', () => {
    assert.deepStrictEqual(findTranslateKeys('this.translate.instant(key)', 'typescript'), []);
  });
});

describe('findTranslateKeys (other languages)', () => {
  it('returns nothing for unsupported languages', () => {
    assert.deepStrictEqual(findTranslateKeys(`'home.title' | translate`, 'json'), []);
  });
});
