/**
 * Pure, VS Code-independent helpers for the language-model auto-translation of
 * placeholder values. Kept free of the `vscode` module so the prompt building
 * and the param-preservation / sanitising logic — the quality-sensitive seam —
 * can be unit-tested without a live model.
 */

/**
 * Builds the prompt that asks the model to translate a single UI string into the
 * target language, keeping interpolation tokens intact and returning nothing but
 * the translation.
 *
 * @param sourceText The main-language value to translate.
 * @param languageCode The ISO code of the target language (the i18n file name).
 */
export function buildTranslationPrompt(sourceText: string, languageCode: string): string {
  return [
    'You are a professional software UI localizer.',
    `Translate the string below into the language with ISO code "${languageCode}".`,
    'Rules:',
    '- Keep every {{ ... }} interpolation token exactly as it appears; never translate or change the text inside the double braces.',
    '- Preserve surrounding punctuation and leading/trailing spacing.',
    '- Return ONLY the translated string: no surrounding quotes, no code fences, no labels, no explanation.',
    '',
    `String: ${sourceText}`
  ].join('\n');
}

/** Extracts the inner (trimmed) expression of every `{{ ... }}` token, in order. */
export function extractParams(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map((match) => match[1]);
}

/**
 * Whether a translation preserved exactly the same interpolation tokens as its
 * source (as a multiset, ignoring order and brace spacing). A model that dropped,
 * added or reworded a `{{ param }}` fails this check so its output is rejected.
 */
export function paramsPreserved(source: string, translated: string): boolean {
  const before = extractParams(source).sort();
  const after = extractParams(translated).sort();
  return before.length === after.length && before.every((param, index) => param === after[index]);
}

/**
 * Normalises a raw model reply into a bare translation: trims whitespace, unwraps
 * a single Markdown code fence, and strips one layer of matching wrapping quotes
 * or backticks the model may have added. Returns an empty string when nothing
 * usable is left.
 */
export function sanitizeTranslation(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
  if (fence) {
    text = fence[1].trim();
  }
  const wrapped = text.match(/^(['"`])([\s\S]*)\1$/);
  if (wrapped) {
    text = wrapped[2].trim();
  }
  return text;
}
