import * as vscode from 'vscode';
import { FileSystemManager } from './utils/fileSystemManager';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { findTranslateKeys, TranslateKeyReference } from './utils/diagnosticsUtils';

/** Languages whose `translate` key references are annotated inline. */
const SUPPORTED_LANGUAGES = ['html', 'typescript'];

/** Longest inline preview before it is ellipsised. */
const MAX_PREVIEW = 40;

/** Collapses whitespace and truncates a translation value for the badge. */
const formatPreview = (value: string): string => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_PREVIEW ? `${clean.slice(0, MAX_PREVIEW - 1)}…` : clean;
};

/**
 * Offset at which to anchor the badge: the end of this reference's translate
 * expression — just past the closing `}}` of the interpolation (HTML) or the
 * call's `)` (TypeScript) — so the badge sits after the whole `{{ … }}` rather
 * than mid-expression. Falls back to just after the key when no closer is found
 * on the same line (e.g. an attribute binding without interpolation).
 */
const badgeOffset = (text: string, reference: TranslateKeyReference, languageId: string): number => {
  const afterKey = reference.index + reference.length + 1; // past the key's closing quote
  const newline = text.indexOf('\n', afterKey);
  const limit = newline === -1 ? text.length : newline;
  const closer = languageId === 'html' ? '}}' : ')';
  const at = text.indexOf(closer, afterKey);
  return at !== -1 && at < limit ? at + closer.length : afterKey;
};

/**
 * Renders each `'key' | translate` (and `TranslateService` key) reference in a
 * template/component with its main-language value shown greyed, inline after the
 * key — the "see the translation without leaving the file" preview. Reuses the
 * cached translations and the same key detection as the diagnostics.
 */
export class InlineTranslationDecorations {

  private static decorationType: vscode.TextEditorDecorationType;

  /**
   * Creates the decoration type, annotates visible editors and wires up listeners
   * so the previews follow the active editor, edits and cache changes.
   *
   * @returns The disposables to add to the extension subscriptions.
   */
  public static register(): vscode.Disposable[] {
    InlineTranslationDecorations.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorInlayHint.foreground'),
        backgroundColor: new vscode.ThemeColor('editorInlayHint.background'),
        // A hairline border in the text colour turns the faint fill into a
        // defined "outlined chip" — subtle, but more visible than the fill alone.
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorInlayHint.foreground'),
        fontWeight: '500',
        margin: '0 0 0 0.8ch',
        // `textDecoration` is the only hook for extra CSS on a decoration
        // attachment — used here to give the badge padding, rounded corners and a
        // slightly smaller size so it reads as a deliberate chip, not a raw pill.
        textDecoration: 'none; border-radius: 4px; padding: 0 6px; font-size: 90%;'
      }
    });
    InlineTranslationDecorations.updateAll();
    return [
      InlineTranslationDecorations.decorationType,
      vscode.window.onDidChangeActiveTextEditor(() => InlineTranslationDecorations.updateAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => InlineTranslationDecorations.updateAll()),
      vscode.workspace.onDidChangeTextDocument((event) => InlineTranslationDecorations.updateFor(event.document))
    ];
  }

  /** Re-annotates every visible editor. Called when the translations cache changes. */
  public static refresh(): void {
    InlineTranslationDecorations.updateAll();
  }

  private static updateAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      InlineTranslationDecorations.updateEditor(editor);
    }
  }

  private static updateFor(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) {
        InlineTranslationDecorations.updateEditor(editor);
      }
    }
  }

  /**
   * Recomputes the inline previews for a single editor. Clears them when the
   * feature is disabled or the language is unsupported. Only keys that resolve to
   * a cached value are annotated; missing keys are left to the diagnostics.
   */
  private static updateEditor(editor: vscode.TextEditor): void {
    if (!InlineTranslationDecorations.decorationType) {
      return;
    }
    const enabled = ExtensionConfigManager.getBooleanConfigValue('inlineTranslations', true);
    if (!enabled || !SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
      editor.setDecorations(InlineTranslationDecorations.decorationType, []);
      return;
    }
    const document = editor.document;
    const text = document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    for (const reference of findTranslateKeys(text, document.languageId)) {
      const value = FileSystemManager.cache?.[reference.key];
      if (typeof value !== 'string') {
        continue;
      }
      // Place the badge after the whole translate expression (past `}}` / `)`).
      const position = document.positionAt(badgeOffset(text, reference, document.languageId));
      decorations.push({
        range: new vscode.Range(position, position),
        renderOptions: { after: { contentText: formatPreview(value) } }
      });
    }
    editor.setDecorations(InlineTranslationDecorations.decorationType, decorations);
  }
}
