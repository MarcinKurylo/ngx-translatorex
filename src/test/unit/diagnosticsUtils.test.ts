import * as assert from 'assert';
import { findTranslateKeys, planReferenceRename } from '../../utils/diagnosticsUtils';

/** Applies planned edits to text, right-to-left so earlier offsets stay valid. */
const applyEdits = (text: string, edits: { index: number; length: number; replacement: string }[]): string => {
  let out = text;
  for (const { index, length, replacement } of [...edits].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, index) + replacement + out.slice(index + length);
  }
  return out;
};

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

describe('planReferenceRename', () => {
  it('rewrites an exact-key reference', () => {
    const text = `<p>{{ 'home.title' | translate }}</p>`;
    assert.strictEqual(
      applyEdits(text, planReferenceRename(text, 'html', 'home.title', 'landing.header')),
      `<p>{{ 'landing.header' | translate }}</p>`
    );
  });

  it('rewrites nested keys when a namespace is renamed', () => {
    const text = `{{ 'home.title' | translate }} {{ 'home.sub' | translate }}`;
    assert.strictEqual(
      applyEdits(text, planReferenceRename(text, 'html', 'home', 'landing')),
      `{{ 'landing.title' | translate }} {{ 'landing.sub' | translate }}`
    );
  });

  it('does not touch keys that merely share a prefix segment', () => {
    const text = `{{ 'home.title' | translate }} {{ 'homepage.title' | translate }}`;
    const edits = planReferenceRename(text, 'html', 'home', 'landing');
    assert.deepStrictEqual(edits.map((e) => e.replacement), ['landing.title']);
  });

  it('rewrites TypeScript references', () => {
    const text = `this.translate.instant('home.title')`;
    assert.strictEqual(
      applyEdits(text, planReferenceRename(text, 'typescript', 'home.title', 'landing.header')),
      `this.translate.instant('landing.header')`
    );
  });

  it('returns no edits when the key is not referenced', () => {
    assert.deepStrictEqual(planReferenceRename(`{{ 'a.b' | translate }}`, 'html', 'x.y', 'z'), []);
  });
});

describe('findTranslateKeys (non-ASCII keys)', () => {
  // generateKey slugifies the selected text without stripping letters, so
  // non-ASCII UI copy produces non-ASCII keys. A key the scanner cannot read
  // back is treated as unused and offered for deletion, pre-selected — so this
  // charset has to cover everything generateKey can emit.
  it('finds a key with non-ASCII letters in a template', () => {
    const refs = findTranslateKeys(`<button>{{ 'home.wyślij_zgłoszenie' | translate }}</button>`, 'html');
    assert.deepStrictEqual(refs.map((ref) => ref.key), ['home.wyślij_zgłoszenie']);
  });

  it('finds a key with non-ASCII letters in a TranslateService call', () => {
    const refs = findTranslateKeys(`this.translate.instant('błąd.zapisu');`, 'typescript');
    assert.deepStrictEqual(refs.map((ref) => ref.key), ['błąd.zapisu']);
  });

  it('reports an offset and length that select exactly the key', () => {
    const text = `<p>{{ 'menü.öffnen' | translate }}</p>`;
    const [ref] = findTranslateKeys(text, 'html');
    assert.strictEqual(text.slice(ref.index, ref.index + ref.length), 'menü.öffnen');
  });

  it('handles scripts beyond Latin', () => {
    assert.deepStrictEqual(
      findTranslateKeys(`<p>{{ 'меню.открыть' | translate }}</p>`, 'html').map((ref) => ref.key),
      ['меню.открыть']
    );
    assert.deepStrictEqual(
      findTranslateKeys(`<p>{{ '菜单.打开' | translate }}</p>`, 'html').map((ref) => ref.key),
      ['菜单.打开']
    );
  });

  it('still does not match across a space, so quoted prose is not a key', () => {
    assert.deepStrictEqual(findTranslateKeys(`<p>{{ 'Wyślij zgłoszenie' | translate }}</p>`, 'html'), []);
  });
});
