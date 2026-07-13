import * as vscode from 'vscode';
import { EXTENSION_IDENTIFIER, ExtensionCommands, HARDCODED_DIAGNOSTIC_SOURCE } from './const';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { findHardcodedStrings } from './utils/hardcodedStringUtils';

/** Only HTML templates are scanned for hard-coded strings. */
const SUPPORTED_LANGUAGES = ['html'];

/**
 * Opt-in detection of hard-coded (untranslated) user-facing strings in Angular
 * templates, surfaced as Information diagnostics with "Extract to i18n key" and
 * "Ignore this string" quick fixes. Kept in a separate diagnostic collection and
 * source from the missing-key diagnostics so the two never interfere.
 */
export class HardcodedStringsProvider implements vscode.CodeActionProvider {

  private static collection: vscode.DiagnosticCollection;

  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  /**
   * Creates the diagnostic collection, scans already-open documents and wires up
   * listeners so findings stay in sync as documents open, change or close. Also
   * registers the quick-fix code action provider.
   *
   * @returns The disposables to add to the extension subscriptions.
   */
  public static register(): vscode.Disposable[] {
    HardcodedStringsProvider.collection = vscode.languages.createDiagnosticCollection(`${EXTENSION_IDENTIFIER}.hardcoded`);
    vscode.workspace.textDocuments.forEach((doc) => HardcodedStringsProvider.refresh(doc));
    return [
      HardcodedStringsProvider.collection,
      vscode.workspace.onDidOpenTextDocument((doc) => HardcodedStringsProvider.refresh(doc)),
      vscode.workspace.onDidChangeTextDocument((event) => HardcodedStringsProvider.refresh(event.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => HardcodedStringsProvider.collection.delete(doc.uri)),
      vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGUAGES, new HardcodedStringsProvider(), {
        providedCodeActionKinds: HardcodedStringsProvider.providedCodeActionKinds
      })
    ];
  }

  /** Re-scans every open document. Called when configuration changes. */
  public static refreshAll(): void {
    vscode.workspace.textDocuments.forEach((doc) => HardcodedStringsProvider.refresh(doc));
  }

  /**
   * Scans a single HTML document for hard-coded strings and flags them as
   * Information diagnostics. Clears the document when detection is disabled or
   * the language is unsupported.
   */
  private static refresh(document: vscode.TextDocument): void {
    const enabled = ExtensionConfigManager.getBooleanConfigValue('detectHardcodedStrings', false);
    if (!HardcodedStringsProvider.collection || !enabled || !SUPPORTED_LANGUAGES.includes(document.languageId)) {
      HardcodedStringsProvider.collection?.delete(document.uri);
      return;
    }
    const candidates = findHardcodedStrings(document.getText(), {
      minLength: ExtensionConfigManager.getNumberConfigValue('hardcodedStringsMinLength', 2),
      ignore: ExtensionConfigManager.getArrayConfigValue('hardcodedStringsIgnore')
    });
    const diagnostics = candidates.map((candidate) => {
      const range = new vscode.Range(
        document.positionAt(candidate.index),
        document.positionAt(candidate.index + candidate.length)
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        `Hard-coded string: '${candidate.text}'`,
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = HARDCODED_DIAGNOSTIC_SOURCE;
      return diagnostic;
    });
    HardcodedStringsProvider.collection.set(document.uri, diagnostics);
  }

  /**
   * Offers "Extract to i18n key" and "Ignore this string" quick fixes for each
   * hard-coded-string diagnostic in the requested range.
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics.filter((d) => d.source === HARDCODED_DIAGNOSTIC_SOURCE)) {
      const extract = new vscode.CodeAction('Extract to i18n key', vscode.CodeActionKind.QuickFix);
      extract.diagnostics = [diagnostic];
      extract.isPreferred = true;
      extract.command = {
        command: `${EXTENSION_IDENTIFIER}.${ExtensionCommands.EXTRACT_HARDCODED_STRING}`,
        title: 'Extract to i18n key',
        arguments: [document.uri, diagnostic.range]
      };
      actions.push(extract);

      const ignore = new vscode.CodeAction('Ignore this string', vscode.CodeActionKind.QuickFix);
      ignore.diagnostics = [diagnostic];
      ignore.command = {
        command: `${EXTENSION_IDENTIFIER}.${ExtensionCommands.IGNORE_HARDCODED_STRING}`,
        title: 'Ignore this string',
        arguments: [document.uri, diagnostic.range]
      };
      actions.push(ignore);
    }
    return actions;
  }
}
