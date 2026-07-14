import * as vscode from 'vscode';
import { EXTENSION_IDENTIFIER, ExtensionCommands } from './const';
import { ExtensionConfigManager } from './utils/extensionConfigManager';
import { FileSystemManager } from './utils/fileSystemManager';
import { listKeyOffsets } from './utils/translationUtils';
import { buildUsageIndex } from './usageIndex';

/**
 * Shows a "used N×" (or "unused") CodeLens above every leaf key in the i18n JSON
 * files, click-through to a peek of the usages. Usages are indexed once from the
 * workspace's templates and components (reusing the diagnostics' key detection)
 * and re-indexed when a source file changes.
 */
export class KeyReferenceCodeLensProvider implements vscode.CodeLensProvider {

  private index: Map<string, vscode.Location[]> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.changed.event;

  /**
   * Registers the CodeLens provider, the peek command and a watcher over source
   * files that invalidates the usage index.
   *
   * @returns The disposables to add to the extension subscriptions.
   */
  public register(): vscode.Disposable[] {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{html,ts}');
    const invalidate = () => {
      this.index = undefined;
      this.changed.fire();
    };
    watcher.onDidChange(invalidate);
    watcher.onDidCreate(invalidate);
    watcher.onDidDelete(invalidate);
    return [
      this.changed,
      watcher,
      vscode.languages.registerCodeLensProvider({ language: 'json' }, this),
      vscode.commands.registerCommand(
        `${EXTENSION_IDENTIFIER}.${ExtensionCommands.SHOW_KEY_REFERENCES}`,
        (uri: vscode.Uri, position: vscode.Position, locations: vscode.Location[]) =>
          vscode.commands.executeCommand('editor.action.showReferences', uri, position, locations)
      )
    ];
  }

  /** Invalidates the usage index and refreshes the lenses. Called on config changes. */
  public refresh(): void {
    this.index = undefined;
    this.changed.fire();
  }

  /**
   * Provides a usage-count lens for each leaf key of an i18n JSON file. Returns
   * nothing for non-i18n JSON or when the feature is disabled.
   */
  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (document.languageId !== 'json' || !ExtensionConfigManager.getBooleanConfigValue('keyUsageCodeLens', true)) {
      return [];
    }
    const languageUris = await FileSystemManager.getLanguageUris();
    if (!languageUris.some((uri) => uri.toString() === document.uri.toString())) {
      return [];
    }
    const index = await this.ensureIndex();
    return listKeyOffsets(document.getText()).map(({ key, offset }) => {
      const position = document.positionAt(offset);
      const locations = index.get(key) ?? [];
      return new vscode.CodeLens(new vscode.Range(position, position), locations.length
        ? {
          title: `$(references) used ${locations.length}×`,
          command: `${EXTENSION_IDENTIFIER}.${ExtensionCommands.SHOW_KEY_REFERENCES}`,
          arguments: [document.uri, position, locations]
        }
        : { title: '$(warning) unused', command: '' });
    });
  }

  /** Builds (and caches) the key → usage-locations index from the workspace's HTML/TS. */
  private async ensureIndex(): Promise<Map<string, vscode.Location[]>> {
    if (!this.index) {
      this.index = await buildUsageIndex();
    }
    return this.index;
  }
}
