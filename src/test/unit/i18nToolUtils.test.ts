import * as assert from 'assert';
import {
  MissingDetail,
  MissingSummary,
  UntranslatedItem,
  findContainingCandidate,
  planFileExtractions,
  shapeMissingTranslations
} from '../../utils/i18nToolUtils';
import { applyExtractionToText } from '../../utils/hardcodedStringUtils';

const items: UntranslatedItem[] = [
  { language: 'pl', key: 'checkout.summary.total', source: 'Total' },
  { language: 'pl', key: 'checkout.pay', source: 'Pay' },
  { language: 'pl', key: 'nav.home', source: 'Home' },
  { language: 'de', key: 'checkout.pay', source: 'Pay' },
  { language: 'de', key: 'standalone', source: 'Standalone' }
];

describe('shapeMissingTranslations', () => {
  it('defaults to summary mode with per-language, per-prefix counts', () => {
    const shaped = shapeMissingTranslations(items) as MissingSummary;
    assert.strictEqual(shaped.mode, 'summary');
    assert.strictEqual(shaped.totalMissing, 5);
    const pl = shaped.languages.find((entry) => entry.language === 'pl')!;
    assert.strictEqual(pl.total, 3);
    assert.deepStrictEqual(pl.byPrefix, [
      { prefix: 'checkout', count: 2 },
      { prefix: 'nav', count: 1 }
    ]);
    // `standalone` has no dot → the whole key is its prefix.
    const de = shaped.languages.find((entry) => entry.language === 'de')!;
    assert.deepStrictEqual(de.byPrefix.map((p) => p.prefix).sort(), ['checkout', 'standalone']);
  });

  it('filters by prefix (exact key and nested)', () => {
    const shaped = shapeMissingTranslations(items, { prefix: 'checkout' }) as MissingSummary;
    assert.strictEqual(shaped.totalMissing, 3);
    // `standalone`/`nav.home` excluded; `checkout.pay` (both langs) + `checkout.summary.total` kept.
  });

  it('does not treat a shared prefix substring as a match', () => {
    const shaped = shapeMissingTranslations(
      [{ language: 'pl', key: 'checkouts.pay', source: 'x' }],
      { prefix: 'checkout' }
    ) as MissingSummary;
    assert.strictEqual(shaped.totalMissing, 0);
  });

  it('filters by language', () => {
    const shaped = shapeMissingTranslations(items, { language: 'de' }) as MissingSummary;
    assert.strictEqual(shaped.totalMissing, 2);
    assert.strictEqual(shaped.languages.length, 1);
    assert.strictEqual(shaped.languages[0].language, 'de');
  });

  it('returns paginated detail when summary is false', () => {
    const shaped = shapeMissingTranslations(items, { summary: false, limit: 2, offset: 0 }) as MissingDetail;
    assert.strictEqual(shaped.mode, 'detail');
    assert.strictEqual(shaped.total, 5);
    assert.strictEqual(shaped.returned, 2);
    assert.strictEqual(shaped.hasMore, true);
    // Sorted by language then key: de entries come first.
    assert.strictEqual(shaped.untranslated[0].language, 'de');
  });

  it('reports the last page with hasMore false', () => {
    const shaped = shapeMissingTranslations(items, { summary: false, limit: 2, offset: 4 }) as MissingDetail;
    assert.strictEqual(shaped.returned, 1);
    assert.strictEqual(shaped.hasMore, false);
  });

  it('combines prefix filter with detail pagination', () => {
    const shaped = shapeMissingTranslations(items, {
      summary: false,
      prefix: 'checkout',
      language: 'pl'
    }) as MissingDetail;
    assert.strictEqual(shaped.total, 2);
    assert.deepStrictEqual(shaped.untranslated.map((entry) => entry.key), ['checkout.pay', 'checkout.summary.total']);
  });
});

describe('planFileExtractions', () => {
  it('extracts several strings from one template in one pass', () => {
    const source = '<button>Save</button><a>Cancel</a><span>Save</span>';
    const { plan, outcomes } = planFileExtractions(source, [
      { text: 'Save', key: 'actions.save' },
      { text: 'Cancel', key: 'actions.cancel' }
    ]);
    assert.strictEqual(outcomes[0].extracted, 2); // both "Save" nodes
    assert.strictEqual(outcomes[1].extracted, 1);
    const applied = applyExtractionToText(source, plan);
    assert.strictEqual(applied.includes("'actions.save' | translate"), true);
    assert.strictEqual(applied.includes("'actions.cancel' | translate"), true);
    assert.strictEqual(applied.includes('>Save<'), false);
  });

  it('reports zero extracted and no plan for text not present', () => {
    const { plan, outcomes } = planFileExtractions('<p>Hello</p>', [{ text: 'Goodbye', key: 'x.bye' }]);
    assert.strictEqual(outcomes[0].extracted, 0);
    assert.strictEqual(plan.length, 0);
  });

  it('binds interpolation params and reports them', () => {
    const source = '<p>Hello {{ name }}</p>';
    const { plan, outcomes } = planFileExtractions(source, [{ text: 'Hello {{ name }}', key: 'greeting' }]);
    assert.deepStrictEqual(outcomes[0].params, ['name']);
    assert.strictEqual(plan[0].text, 'Hello {{ name }}');
    assert.strictEqual(applyExtractionToText(source, plan).includes("translate:{ name }"), true);
  });

  it('never double-claims the same occurrence for two requests', () => {
    const source = '<span>Close</span>';
    const { plan } = planFileExtractions(source, [
      { text: 'Close', key: 'a.close' },
      { text: 'Close', key: 'b.close' }
    ]);
    assert.strictEqual(plan.length, 1); // one occurrence → claimed once
    assert.strictEqual(plan[0].key, 'a.close');
  });
});

describe('findContainingCandidate', () => {
  it('finds the interpolated node a fragment lives inside', () => {
    const source = '<p>Errors, line {{ error.key }}</p>';
    const match = findContainingCandidate(source, 'Errors, line');
    assert.deepStrictEqual(match, { containingText: 'Errors, line {{ error.key }}' });
  });

  it('returns undefined when an exact candidate exists', () => {
    assert.strictEqual(findContainingCandidate('<p>Save changes</p>', 'Save changes'), undefined);
  });

  it('returns undefined when nothing contains the text', () => {
    assert.strictEqual(findContainingCandidate('<p>Hello world</p>', 'Goodbye'), undefined);
  });
});
