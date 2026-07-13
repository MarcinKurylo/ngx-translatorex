import * as assert from 'assert';
import {
  buildTranslationPrompt,
  extractParams,
  paramsPreserved,
  sanitizeTranslation
} from '../../utils/translationLmUtils';

describe('buildTranslationPrompt', () => {
  it('includes the source string, the target code and the param rule', () => {
    const prompt = buildTranslationPrompt('Welcome {{ name }}', 'pl');
    assert.ok(prompt.includes('Welcome {{ name }}'));
    assert.ok(prompt.includes('"pl"'));
    assert.ok(/\{\{ \.\.\. \}\}/.test(prompt));
  });
});

describe('extractParams', () => {
  it('returns the trimmed inner expression of each interpolation', () => {
    assert.deepStrictEqual(extractParams('Hi {{ name }}, {{count}} left'), ['name', 'count']);
  });

  it('returns an empty array when there are no params', () => {
    assert.deepStrictEqual(extractParams('No params here'), []);
  });
});

describe('paramsPreserved', () => {
  it('accepts a translation keeping the same params, ignoring order and spacing', () => {
    assert.strictEqual(paramsPreserved('Hi {{ name }}, {{ count }}', 'Cześć {{count}}, {{ name }}'), true);
  });

  it('accepts when there are no params on either side', () => {
    assert.strictEqual(paramsPreserved('Save', 'Zapisz'), true);
  });

  it('rejects a translation that dropped a param', () => {
    assert.strictEqual(paramsPreserved('Hi {{ name }}', 'Cześć'), false);
  });

  it('rejects a translation that reworded a param', () => {
    assert.strictEqual(paramsPreserved('Hi {{ name }}', 'Cześć {{ imie }}'), false);
  });

  it('rejects a translation that added a param', () => {
    assert.strictEqual(paramsPreserved('Hi', 'Cześć {{ name }}'), false);
  });
});

describe('sanitizeTranslation', () => {
  it('trims surrounding whitespace', () => {
    assert.strictEqual(sanitizeTranslation('  Zapisz  '), 'Zapisz');
  });

  it('strips one layer of wrapping quotes or backticks', () => {
    assert.strictEqual(sanitizeTranslation('"Zapisz"'), 'Zapisz');
    assert.strictEqual(sanitizeTranslation("'Zapisz'"), 'Zapisz');
    assert.strictEqual(sanitizeTranslation('`Zapisz`'), 'Zapisz');
  });

  it('unwraps a markdown code fence', () => {
    assert.strictEqual(sanitizeTranslation('```\nZapisz\n```'), 'Zapisz');
    assert.strictEqual(sanitizeTranslation('```text\nWitaj {{ name }}\n```'), 'Witaj {{ name }}');
  });

  it('leaves a clean translation untouched, keeping inner apostrophes', () => {
    assert.strictEqual(sanitizeTranslation("N'oubliez pas"), "N'oubliez pas");
  });

  it('returns an empty string for a blank reply', () => {
    assert.strictEqual(sanitizeTranslation('   '), '');
  });
});
