import * as assert from 'assert';
import * as path from 'path';
import {
  MissingDetail,
  MissingSummary,
  UntranslatedItem,
  collectUntranslatedItems,
  findContainingCandidate,
  planFileExtractions,
  planSeed,
  rejectKeyCreation,
  rejectTranslationWrite,
  rejectionMessage,
  resolveContainedPath,
  shapeMissingTranslations
} from '../../utils/i18nToolUtils';
import { TranslationTree } from '../../utils/translationUtils';
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

describe('planSeed', () => {
  const PLACEHOLDER = '[TODO]';
  const main = { 'a.one': 'One', 'a.two': 'Two', 'a.three': 'Three' };

  it('seeds missing and placeholder keys with the placeholder by default', () => {
    const language = { 'a.one': 'Jeden', 'a.two': PLACEHOLDER };
    const plan = planSeed(main, language, PLACEHOLDER, false);
    // a.two already holds the placeholder → no-op dropped; a.three missing → seeded.
    assert.deepStrictEqual(plan, [{ key: 'a.three', value: PLACEHOLDER }]);
  });

  it('copies the main-language source when copySource is set', () => {
    const language = { 'a.one': 'Jeden' };
    const plan = planSeed(main, language, PLACEHOLDER, true);
    assert.deepStrictEqual(plan, [
      { key: 'a.two', value: 'Two' },
      { key: 'a.three', value: 'Three' }
    ]);
  });

  it('returns nothing when the language is fully translated', () => {
    const language = { 'a.one': 'Jeden', 'a.two': 'Dwa', 'a.three': 'Trzy' };
    assert.deepStrictEqual(planSeed(main, language, PLACEHOLDER, false), []);
  });
});

describe('resolveContainedPath', () => {
  const root = path.resolve('/workspace/project');

  it('resolves a project-relative path to an absolute one', () => {
    assert.strictEqual(
      resolveContainedPath(root, 'src/app/home.component.html'),
      path.join(root, 'src/app/home.component.html')
    );
  });

  it('allows an inner traversal that stays inside the root', () => {
    assert.strictEqual(
      resolveContainedPath(root, 'src/app/../home.html'),
      path.join(root, 'src/home.html')
    );
  });

  it('allows the root itself', () => {
    assert.strictEqual(resolveContainedPath(root, '.'), root);
  });

  it('allows an absolute path that lies inside the root', () => {
    const inside = path.join(root, 'src/home.html');
    assert.strictEqual(resolveContainedPath(root, inside), inside);
  });

  it('rejects a traversal that escapes the root', () => {
    assert.strictEqual(resolveContainedPath(root, '../../../../etc/passwd'), undefined);
  });

  it('rejects an absolute path outside the root, which resolve would honour verbatim', () => {
    assert.strictEqual(resolveContainedPath(root, path.resolve('/etc/passwd')), undefined);
  });

  it('rejects a sibling directory sharing the root as a name prefix', () => {
    assert.strictEqual(resolveContainedPath(root, '../project-evil/x.html'), undefined);
  });

  it('rejects a path that escapes only after normalisation', () => {
    assert.strictEqual(resolveContainedPath(root, 'src/../../outside/x.html'), undefined);
  });
});

describe('collectUntranslatedItems', () => {
  const PLACEHOLDER = '[TODO]';
  const languages: { language: string; tree: TranslationTree }[] = [
    { language: 'en', tree: { home: { title: 'Home', subtitle: 'Welcome' } } },
    { language: 'pl', tree: { home: { title: 'Dom', subtitle: PLACEHOLDER } } },
    { language: 'de', tree: { home: { title: 'Zuhause' } } }
  ];

  it('reports keys that are missing or still placeholder, with their source', () => {
    const items = collectUntranslatedItems(languages, 'en', PLACEHOLDER);
    assert.deepStrictEqual(items, [
      { language: 'pl', key: 'home.subtitle', source: 'Welcome' },
      { language: 'de', key: 'home.subtitle', source: 'Welcome' }
    ]);
  });

  it('never asks the agent to translate a key with no main-language source', () => {
    // The drift this function exists to remove: the report-based collection
    // diffed against the union of all languages, so a stale key surviving only
    // in a secondary file came back with source: null.
    const withLegacy: { language: string; tree: TranslationTree }[] = [
      ...languages,
      { language: 'fr', tree: { home: { title: 'Accueil', subtitle: 'Bienvenue' }, old: { banner: 'Vieux' } } }
    ];
    const items = collectUntranslatedItems(withLegacy, 'en', PLACEHOLDER);
    assert.strictEqual(items.some((item) => item.key === 'old.banner'), false);
    assert.strictEqual(items.every((item) => item.source !== null), true);
  });

  it('skips keys whose main-language value is itself the placeholder', () => {
    const items = collectUntranslatedItems(
      [
        { language: 'en', tree: { a: PLACEHOLDER, b: 'Real' } },
        { language: 'pl', tree: {} }
      ],
      'en',
      PLACEHOLDER
    );
    assert.deepStrictEqual(items.map((item) => item.key), ['b']);
  });

  it('excludes the main language and honours a custom placeholder', () => {
    const items = collectUntranslatedItems(
      [
        { language: 'en', tree: { a: 'Real' } },
        { language: 'pl', tree: { a: '[UNTRANSLATED]' } }
      ],
      'en',
      '[UNTRANSLATED]'
    );
    assert.deepStrictEqual(items, [{ language: 'pl', key: 'a', source: 'Real' }]);
  });

  it('returns nothing when there is no main language file', () => {
    assert.deepStrictEqual(collectUntranslatedItems([{ language: 'pl', tree: { a: 'x' } }], 'en', PLACEHOLDER), []);
  });
});

describe('rejectTranslationWrite', () => {
  // The one rule set both agent surfaces apply. Before it existed they had drifted
  // to three different answers for the same request.
  const mainFlat = { 'home.greeting': 'Hello', 'home.hi': 'Hi {{ name }}', 'home.plain': 'Plain' };

  it('allows an ordinary translation', () => {
    assert.strictEqual(
      rejectTranslationWrite({ key: 'home.plain', value: 'Zwykły' }, mainFlat, { home: { plain: '[TODO]' } }),
      undefined
    );
  });

  it('rejects a key addressing the prototype chain', () => {
    assert.strictEqual(rejectTranslationWrite({ key: '__proto__.pwn', value: 'x' }, mainFlat, {}), 'invalid-key');
  });

  it('rejects a value that drops a {{ param }} from the source', () => {
    assert.strictEqual(rejectTranslationWrite({ key: 'home.hi', value: 'Cześć' }, mainFlat, {}), 'params-lost');
  });

  it('keeps a value that preserves its {{ param }}', () => {
    assert.strictEqual(rejectTranslationWrite({ key: 'home.hi', value: 'Cześć {{ name }}' }, mainFlat, {}), undefined);
  });

  it('rejects a write that would trade an existing translation for a namespace', () => {
    assert.strictEqual(
      rejectTranslationWrite({ key: 'home.greeting.formal', value: 'Dzień dobry' }, mainFlat, { home: { greeting: 'Witaj' } }),
      'key-conflict'
    );
  });

  it('checks the conflict against the target language, not the main one', () => {
    // en may already have restructured; pl still holds the string.
    assert.strictEqual(
      rejectTranslationWrite({ key: 'home.greeting.formal', value: 'x' }, mainFlat, { home: { greeting: { casual: 'Cześć' } } }),
      undefined
    );
  });
});

describe('rejectKeyCreation', () => {
  it('refuses a key that cannot be created without discarding a translation', () => {
    assert.strictEqual(rejectKeyCreation('home.greeting.formal', { home: { greeting: 'Hello' } }), 'key-conflict');
  });

  it('refuses an invalid key', () => {
    assert.strictEqual(rejectKeyCreation('__proto__.x', {}), 'invalid-key');
    assert.strictEqual(rejectKeyCreation('trailing.', {}), 'invalid-key');
  });

  it('allows a fresh key', () => {
    assert.strictEqual(rejectKeyCreation('home.welcome', { home: { greeting: 'Hello' } }), undefined);
  });
});

describe('rejectionMessage', () => {
  it('names the key in every reason', () => {
    for (const reason of ['invalid-key', 'params-lost', 'key-conflict'] as const) {
      assert.ok(rejectionMessage(reason, 'home.x').includes('home.x'), reason);
    }
  });
});

describe('planSeed conflicts', () => {
  it('never trades a real translation for a placeholder', () => {
    const plan = planSeed({ 'home.greeting.formal': 'Good day' }, { home: { greeting: 'Witaj' } }, '[TODO]', false);
    assert.deepStrictEqual(plan, []);
  });

  it('still seeds keys that do not conflict', () => {
    const plan = planSeed(
      { 'home.greeting.formal': 'Good day', 'home.other': 'Other' },
      { home: { greeting: 'Witaj' } },
      '[TODO]',
      false
    );
    assert.deepStrictEqual(plan, [{ key: 'home.other', value: '[TODO]' }]);
  });

  it('still replaces a placeholder sitting at the key itself when copying the source', () => {
    const plan = planSeed({ 'a.b': 'Source' }, { a: { b: '[TODO]' } }, '[TODO]', true);
    assert.deepStrictEqual(plan, [{ key: 'a.b', value: 'Source' }]);
  });
});
