import * as assert from 'assert';
import { applyExtractionToText, findHardcodedStrings, interpolationSnippet, locateHardcodedStrings, normalizeInterpolation, planBulkExtraction } from '../../utils/hardcodedStringUtils';

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

  describe('category and confidence', () => {
    it('tags text nodes vs attribute values', () => {
      const html = '<h1>Welcome home</h1><input title="Full name">';
      const found = findHardcodedStrings(html);
      assert.strictEqual(found.find((c) => c.text === 'Welcome home')!.category, 'text');
      assert.strictEqual(found.find((c) => c.text === 'Full name')!.category, 'attribute');
    });

    it('rates multi-word text and attribute values high, a bare word low', () => {
      const found = findHardcodedStrings('<h1>Welcome home</h1><a>Save</a><input title="Go">');
      assert.strictEqual(found.find((c) => c.text === 'Welcome home')!.confidence, 'high');
      assert.strictEqual(found.find((c) => c.text === 'Save')!.confidence, 'low');
      assert.strictEqual(found.find((c) => c.text === 'Go')!.confidence, 'high'); // attribute → high
    });

    it('rates interpolated (mixed) text high', () => {
      const [candidate] = findHardcodedStrings('<p>Hello {{ name }}</p>');
      assert.strictEqual(candidate.confidence, 'high');
    });
  });

  describe('edge cases', () => {
    it('returns nothing for empty or whitespace-only input', () => {
      assert.deepStrictEqual(findHardcodedStrings(''), []);
      assert.deepStrictEqual(findHardcodedStrings('   \n\t '), []);
    });

    it('flags text that appears before the first tag', () => {
      assert.deepStrictEqual(texts('Leading copy<div>x</div>'), ['Leading copy']);
    });

    it('captures a multi-line text node whole, with a correct offset', () => {
      const html = '<p>First line\nsecond line</p>';
      const [candidate] = findHardcodedStrings(html);
      assert.strictEqual(candidate.text, 'First line\nsecond line');
      assert.strictEqual(html.slice(candidate.index, candidate.index + candidate.length), 'First line\nsecond line');
    });

    it('handles single-quoted values and spaces around the attribute =', () => {
      assert.deepStrictEqual(texts(`<input title = 'Enter name'>`), ['Enter name']);
    });

    it('keeps an apostrophe inside prose', () => {
      assert.deepStrictEqual(texts(`<p>Don't stop</p>`), [`Don't stop`]);
    });

    it('skips an attribute whose value is only an interpolation', () => {
      assert.deepStrictEqual(texts(`<input placeholder="{{ ph }}">`), []);
    });

    it('skips a node made of several interpolations with no static word', () => {
      assert.deepStrictEqual(texts('<p>{{ a }} {{ b }}</p>'), []);
    });

    it('skips an entity-only node but keeps an entity mixed with words, verbatim', () => {
      assert.deepStrictEqual(texts('<p>&nbsp;</p>'), []);
      assert.deepStrictEqual(texts('<footer>&copy; Acme Inc</footer>'), ['&copy; Acme Inc']);
    });

    it('keeps all-caps acronyms', () => {
      assert.deepStrictEqual(texts('<a>FAQ</a>'), ['FAQ']);
    });

    it('matches wildcard ignore patterns on a word boundary, not mid-word', () => {
      const html = '<p>Read more</p><p>Reader</p>';
      assert.deepStrictEqual(texts(html, { ignore: ['Read *'] }), ['Reader']);
    });

    it('treats minLength as inclusive', () => {
      assert.deepStrictEqual(texts('<b>Hi</b>', { minLength: 2 }), ['Hi']);
    });

    it('is case-sensitive for exact ignore patterns', () => {
      assert.deepStrictEqual(texts('<p>OK</p>', { ignore: ['ok'] }), ['OK']);
    });
  });
});

describe('locateHardcodedStrings', () => {
  it('tags each candidate with its one-based line number', () => {
    const html = '<div>\n  <h1>Title</h1>\n\n  <p>Body</p>\n</div>';
    const located = locateHardcodedStrings(html);
    assert.deepStrictEqual(located.map((c) => [c.text, c.line]), [['Title', 2], ['Body', 4]]);
  });

  it('counts the line of a candidate inside a multi-line node from its start', () => {
    const html = '<a>x</a>\n<a>x</a>\n<p>Real text</p>';
    const [located] = locateHardcodedStrings(html);
    assert.strictEqual(located.text, 'Real text');
    assert.strictEqual(located.line, 3);
  });

  it('returns an empty array when there are no findings', () => {
    assert.deepStrictEqual(locateHardcodedStrings('<p>{{ x }}</p>'), []);
  });
});

describe('planBulkExtraction', () => {
  const find = (html: string) => findHardcodedStrings(html);

  it('generates scoped keys and translate snippets', () => {
    const plan = planBulkExtraction(find('<h1>Welcome home</h1>'), 'home');
    assert.deepStrictEqual(plan, [{
      index: 4,
      length: 12,
      text: 'Welcome home',
      key: 'home.welcome_home',
      snippet: `{{ 'home.welcome_home' | translate }}`
    }]);
  });

  it('produces top-level keys for an empty scope', () => {
    const plan = planBulkExtraction(find('<button>Save</button>'), '');
    assert.strictEqual(plan[0].key, 'save');
    assert.strictEqual(plan[0].snippet, `{{ 'save' | translate }}`);
  });

  it('reuses the same key for identical text', () => {
    const plan = planBulkExtraction(find('<a>Save</a><b>Save</b>'), '');
    assert.deepStrictEqual(plan.map((p) => p.key), ['save', 'save']);
  });

  it('disambiguates different text that slugifies to the same key', () => {
    const plan = planBulkExtraction(find('<a>Save</a><b>Save!</b>'), '');
    assert.deepStrictEqual(plan.map((p) => [p.text, p.key]), [['Save', 'save'], ['Save!', 'save_2']]);
  });

  it('extracts interpolated text, normalising the value and binding the param', () => {
    const [item] = planBulkExtraction(find('<p>Hello {{ userName }}</p>'), 'home');
    assert.strictEqual(item.text, 'Hello {{ userName }}');
    assert.strictEqual(item.snippet, `{{ 'home.hello_username' | translate:{ userName } }}`);
  });

  it('keeps candidates in source order', () => {
    const plan = planBulkExtraction(find('<h1>First</h1><p>Second</p>'), '');
    assert.deepStrictEqual(plan.map((p) => p.key), ['first', 'second']);
    assert.ok(plan[0].index < plan[1].index);
  });
});

describe('applyExtractionToText', () => {
  it('replaces every planned occurrence with its snippet, offsets intact', () => {
    const html = '<h1>Welcome home</h1><button>Save</button>';
    const out = applyExtractionToText(html, planBulkExtraction(findHardcodedStrings(html), 'home'));
    assert.strictEqual(
      out,
      `<h1>{{ 'home.welcome_home' | translate }}</h1><button>{{ 'home.save' | translate }}</button>`
    );
  });

  it('returns the text unchanged for an empty plan', () => {
    assert.strictEqual(applyExtractionToText('<p>x</p>', []), '<p>x</p>');
  });
});

describe('normalizeInterpolation', () => {
  it('keeps identifier params by name', () => {
    assert.deepStrictEqual(normalizeInterpolation('Hi {{ name }}'), {
      value: 'Hi {{ name }}',
      params: [{ name: 'name', expression: 'name' }]
    });
  });

  it('generates names for complex expressions and reuses one per expression', () => {
    const result = normalizeInterpolation('{{ user.name }} has {{ count + 1 }} of {{ user.name }}');
    assert.strictEqual(result.value, '{{ param1 }} has {{ param2 }} of {{ param1 }}');
    assert.deepStrictEqual(result.params, [
      { name: 'param1', expression: 'user.name' },
      { name: 'param2', expression: 'count + 1' }
    ]);
  });

  it('leaves plain text untouched with no params', () => {
    assert.deepStrictEqual(normalizeInterpolation('Just text'), { value: 'Just text', params: [] });
  });
});

describe('interpolationSnippet', () => {
  it('is a plain pipe with no params', () => {
    assert.strictEqual(interpolationSnippet('a.b', []), `{{ 'a.b' | translate }}`);
  });

  it('uses object shorthand for identifier params and name:expr for complex ones', () => {
    assert.strictEqual(
      interpolationSnippet('a.b', [{ name: 'name', expression: 'name' }, { name: 'param2', expression: 'user.name' }]),
      `{{ 'a.b' | translate:{ name, param2: user.name } }}`
    );
  });
});
