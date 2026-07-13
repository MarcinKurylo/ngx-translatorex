import * as vscode from 'vscode';
import { FileSystemManager } from './utils/fileSystemManager';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { findTranslateKeys } from './utils/diagnosticsUtils';

/** Languages whose `translate` key references are annotated inline. */
const SUPPORTED_LANGUAGES = ['html', 'typescript'];

/** Longest inline preview before it is ellipsised. */
const MAX_PREVIEW = 40;

/** Collapses whitespace and truncates a translation value for inline display. */
const formatPreview = (value: string): string => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_PREVIEW ? `${clean.slice(0, MAX_PREVIEW - 1)}…` : clean;
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
        fontStyle: 'italic',
        margin: '0 0 0 0.6ch'
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
    const decorations: vscode.DecorationOptions[] = [];
    for (const reference of findTranslateKeys(document.getText(), document.languageId)) {
      const value = FileSystemManager.cache?.[reference.key];
      if (typeof value !== 'string') {
        continue;
      }
      // Place the preview just after the closing quote of the key.
      const position = document.positionAt(reference.index + reference.length + 1);
      decorations.push({
        range: new vscode.Range(position, position),
        renderOptions: { after: { contentText: formatPreview(value) } }
      });
    }
    editor.setDecorations(InlineTranslationDecorations.decorationType, decorations);
  }
}
