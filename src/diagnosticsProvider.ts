import * as vscode from 'vscode';
import { EXTENSION_IDENTIFIER, ExtensionCommands } from './const';
import { FileSystemManager } from './utils/fileSystemManager';
import { findTranslateKeys } from './utils/diagnosticsUtils';

/** Document languages that are scanned for translation-key references. */
const SUPPORTED_LANGUAGES = ['html', 'typescript'];

/**
 * Reports ngx-translate keys used in templates and components that are missing
 * from the current translations, as warnings, and offers a "Create i18n key"
 * quick fix that adds the key across all language files.
 */
export class DiagnosticsProvider implements vscode.CodeActionProvider {

  private static collection: vscode.DiagnosticCollection;

  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  /**
   * Creates the diagnostic collection, lints already-open documents and wires up
   * listeners so diagnostics stay in sync as documents open, change or close.
   * Also registers the quick-fix code action provider.
   *
   * @returns The disposables to add to the extension subscriptions.
   */
  public static register(): vscode.Disposable[] {
    DiagnosticsProvider.collection = vscode.languages.createDiagnosticCollection(EXTENSION_IDENTIFIER);
    vscode.workspace.textDocuments.forEach((doc) => DiagnosticsProvider.refresh(doc));
    return [
      DiagnosticsProvider.collection,
      vscode.workspace.onDidOpenTextDocument((doc) => DiagnosticsProvider.refresh(doc)),
      vscode.workspace.onDidChangeTextDocument((event) => DiagnosticsProvider.refresh(event.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => DiagnosticsProvider.collection.delete(doc.uri)),
      vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGUAGES, new DiagnosticsProvider(), {
        providedCodeActionKinds: DiagnosticsProvider.providedCodeActionKinds
      })
    ];
  }

  /** Re-lints every open document. Called when the translations cache changes. */
  public static refreshAll(): void {
    vscode.workspace.textDocuments.forEach((doc) => DiagnosticsProvider.refresh(doc));
  }

  /**
   * Scans a single document for translation-key references and flags those that
   * are absent from the cache. Non-supported languages are cleared.
   */
  private static refresh(document: vscode.TextDocument): void {
    if (!DiagnosticsProvider.collection || !SUPPORTED_LANGUAGES.includes(document.languageId)) {
      DiagnosticsProvider.collection?.delete(document.uri);
      return;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    for (const ref of findTranslateKeys(document.getText(), document.languageId)) {
      if (FileSystemManager.cache?.[ref.key] === undefined) {
        const range = new vscode.Range(
          document.positionAt(ref.index),
          document.positionAt(ref.index + ref.length)
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          `Missing i18n key: '${ref.key}'`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = EXTENSION_IDENTIFIER;
        diagnostic.code = ref.key;
        diagnostics.push(diagnostic);
      }
    }
    DiagnosticsProvider.collection.set(document.uri, diagnostics);
  }

  /**
   * Offers a "Create i18n key" quick fix for each of this extension's missing-key
   * diagnostics in the requested range.
   */
  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    return context.diagnostics
      .filter((diagnostic) => diagnostic.source === EXTENSION_IDENTIFIER)
      .map((diagnostic) => {
        const key = String(diagnostic.code);
        const action = new vscode.CodeAction(`Create i18n key '${key}'`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: `${EXTENSION_IDENTIFIER}.${ExtensionCommands.CREATE_TRANSLATION_KEY}`,
          title: 'Create i18n key',
          arguments: [key]
        };
        return action;
      });
  }
}
