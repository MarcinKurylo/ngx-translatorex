import * as assert from 'assert';
import {
  MissingDetail,
  MissingSummary,
  UntranslatedItem,
  shapeMissingTranslations
} from '../../utils/i18nToolUtils';

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
