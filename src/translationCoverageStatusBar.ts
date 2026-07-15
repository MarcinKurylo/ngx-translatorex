import * as vscode from 'vscode';
import { EXTENSION_IDENTIFIER, ExtensionCommands } from './const';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { buildTranslationCoverage } from './utils/translationUtils';

/**
 * A status-bar item showing per-language translation coverage
 * (`pl 87% · fr 60% · es 40%`), click-through to the full translation report.
 * Recomputes from all language files whenever any of them changes.
 */
export class TranslationCoverageStatusBar {

  private static item: vscode.StatusBarItem;
  private static watcher: vscode.FileSystemWatcher | undefined;

  /**
   * Creates the status-bar item and a watcher over the i18n folder so coverage
   * stays current as language files change.
   *
   * @returns The disposables to add to the extension subscriptions.
   */
  public static register(): vscode.Disposable[] {
    TranslationCoverageStatusBar.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    TranslationCoverageStatusBar.item.command = `${EXTENSION_IDENTIFIER}.${ExtensionCommands.SHOW_TRANSLATION_REPORT}`;
    TranslationCoverageStatusBar.watchFiles();
    void TranslationCoverageStatusBar.refresh();
    return [
      TranslationCoverageStatusBar.item,
      { dispose: () => TranslationCoverageStatusBar.watcher?.dispose() }
    ];
  }

  /** (Re)creates the i18n-folder watcher and refreshes. Called on config changes. */
  public static watchFiles(): void {
    TranslationCoverageStatusBar.watcher?.dispose();
    const pattern = `${ExtensionConfigManager.getConfigValue('path')}*.json`;
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = () => void TranslationCoverageStatusBar.refresh();
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    TranslationCoverageStatusBar.watcher = watcher;
  }

  /**
   * Recomputes coverage across all language files and updates the item. Hidden
   * when the feature is off or there is nothing meaningful to show (fewer than two
   * languages). The main language is omitted — it is the 100% baseline.
   */
  public static async refresh(): Promise<void> {
    if (!TranslationCoverageStatusBar.item) {
      return;
    }
    if (!ExtensionConfigManager.getBooleanConfigValue('translationCoverageStatusBar', true)) {
      TranslationCoverageStatusBar.item.hide();
      return;
    }
    const languages = await FileSystemManager.getAllLanguageTranslations();
    const mainLanguage = ExtensionConfigManager.getConfigValue('language') ?? 'en';
    const coverage = buildTranslationCoverage(languages, ExtensionConfigManager.getPlaceholder())
      .filter((entry) => entry.language !== mainLanguage);
    if (!coverage.length) {
      TranslationCoverageStatusBar.item.hide();
      return;
    }
    TranslationCoverageStatusBar.item.text = `$(globe) ${coverage.map((entry) => `${entry.language} ${entry.percent}%`).join(' · ')}`;
    const lines = coverage.map((entry) => `- ${entry.language}: ${entry.percent}% translated`);
    TranslationCoverageStatusBar.item.tooltip = new vscode.MarkdownString(
      `**Translation coverage** (vs \`${mainLanguage}\`)\n\n${lines.join('\n')}\n\nClick to open the full report.`
    );
    TranslationCoverageStatusBar.item.show();
  }
}
