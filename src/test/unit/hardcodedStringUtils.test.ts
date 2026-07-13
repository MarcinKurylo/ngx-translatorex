import * as assert from 'assert';
import { findHardcodedStrings } from '../../utils/hardcodedStringUtils';

const texts = (html: string, options?: Parameters<typeof findHardcodedStrings>[1]) =>
  findHardcodedStrings(html, options).map((c) => c.text);

describe('findHardcodedStrings', () => {
  it('flags a plain text node', () => {
    assert.deepStrictEqual(texts('<h1>Welcome home</h1>'), ['Welcome home']);
  });

  it('reports a tight, trimmed range for the flagged text', () => {
    const html = '<h1>   Save   </h1>';
    const [candidate] = findHardcodedStrings(html);
    assert.strictEqual(candidate.text, 'Save');
    assert.strictEqual(html.slice(candidate.index, candidate.index + candidate.length), 'Save');
  });

  it('flags title, placeholder, aria-label, alt and matTooltip attributes', () => {
    const html = `<input placeholder="Your name" title="Full name" aria-label="Name field">` +
      `<img alt="Company logo"><button matTooltip="Save changes"></button>`;
    assert.deepStrictEqual(texts(html), ['Your name', 'Full name', 'Name field', 'Company logo', 'Save changes']);
  });

  it('keeps text mixing static words with an interpolation, whole', () => {
    assert.deepStrictEqual(texts('<p>Hello {{ name }}</p>'), ['Hello {{ name }}']);
    assert.deepStrictEqual(texts(`<p>{{ count }} items left</p>`), ['{{ count }} items left']);
  });

  it('still skips a node that is only an interpolation or pipe', () => {
    assert.deepStrictEqual(texts('<p>{{ user.name }}</p>'), []);
    assert.deepStrictEqual(texts(`<p>{{ 'a' | translate }}</p>`), []);
  });

  it('skips version-like and symbol tokens without a real word', () => {
    assert.deepStrictEqual(texts('<span>v2.0</span><span>3.14</span><span>100%</span>'), []);
  });

  it('skips code-like single tokens (urls, paths, identifiers)', () => {
    const html = `<a>https://example.com</a><span>./assets/x</span><span>user_id</span>` +
      `<span>camelCase</span><span>home.title</span><span>#anchor</span>`;
    assert.deepStrictEqual(texts(html), []);
  });

  it('keeps ordinary single-word prose', () => {
    assert.deepStrictEqual(texts('<button>Cancel</button><b>Welcome!</b>'), ['Cancel', 'Welcome!']);
  });

  it('skips numbers, whitespace, single characters and icons', () => {
    assert.deepStrictEqual(texts('<span>42</span><span> </span><span>x</span><span>×</span>'), []);
  });

  it('skips text that is already an Angular binding or translate pipe', () => {
    assert.deepStrictEqual(texts(`<h1>{{ 'home.title' | translate }}</h1>`), []);
    assert.deepStrictEqual(texts('<p>{{ user.name }}</p>'), []);
  });

  it('skips bound attributes like [title]="expr"', () => {
    assert.deepStrictEqual(texts(`<div [title]="tooltip" [attr.aria-label]="label"></div>`), []);
  });

  it('does not scan inside <script> or <style> blocks', () => {
    const html = `<style>.a{content:"Hidden"}</style><script>const s = "Secret";</script><p>Visible</p>`;
    assert.deepStrictEqual(texts(html), ['Visible']);
  });

  it('does not scan inside comments', () => {
    assert.deepStrictEqual(texts('<!-- Draft copy here --><p>Real</p>'), ['Real']);
  });

  it('honours the minLength option', () => {
    assert.deepStrictEqual(texts('<b>Hi</b><b>Go</b>', { minLength: 3 }), []);
    assert.deepStrictEqual(texts('<b>Hey</b>', { minLength: 3 }), ['Hey']);
  });

  it('honours exact and wildcard ignore patterns', () => {
    const html = '<p>OK</p><p>Cancel</p><p>© 2026 Acme</p>';
    assert.deepStrictEqual(texts(html, { ignore: ['OK', '© *'] }), ['Cancel']);
  });

  it('skips a string on a line carrying the inline i18n-ignore marker', () => {
    const html = `<p>Kept</p>\n<p>Skipped</p> <!-- i18n-ignore -->`;
    assert.deepStrictEqual(texts(html), ['Kept']);
  });

  it('skips a string when the marker is on the line above it', () => {
    const html = `<!-- i18n-ignore -->\n<p>Skipped</p>\n<p>Kept</p>`;
    assert.deepStrictEqual(texts(html), ['Kept']);
  });

  it('returns candidates sorted by position', () => {
    const found = findHardcodedStrings('<h1>First</h1><p>Second</p>');
    assert.deepStrictEqual(found.map((c) => c.text), ['First', 'Second']);
    assert.ok(found[0].index < found[1].index);
  });
});
