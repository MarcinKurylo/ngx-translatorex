import * as vscode from 'vscode';
import { FileSystemManager } from './utils/fileSystemManager';
import { findTranslateKeys } from './utils/diagnosticsUtils';
import { findKeyOffsetInJson } from './utils/translationUtils';

/** Document languages in which translation-key references can be resolved. */
const SUPPORTED_LANGUAGES = ['html', 'typescript'];

export class DefinitionProviders {

  /**
   * Registers a definition provider for HTML and TypeScript so that a
   * go-to-definition (or Ctrl/Cmd+Click) on a `translate` key jumps to the exact
   * line of that key in the main language JSON file. Reuses the same key
   * detection as the diagnostics so only real translate references resolve.
   *
   * @returns The provider disposable, to be added to the extension subscriptions.
   */
  public static registerDefinitionProvider(): vscode.Disposable {
    return vscode.languages.registerDefinitionProvider(SUPPORTED_LANGUAGES, {
      async provideDefinition(document, position) {
        const offset = document.offsetAt(position);
        const reference = findTranslateKeys(document.getText(), document.languageId)
          .find((ref) => offset >= ref.index && offset <= ref.index + ref.length);
        if (!reference) {
          return undefined;
        }
        const uri = await FileSystemManager.getUri();
        if (!uri) {
          return undefined;
        }
        const target = await vscode.workspace.openTextDocument(uri);
        const keyOffset = findKeyOffsetInJson(target.getText(), reference.key);
        if (keyOffset === undefined) {
          return undefined;
        }
        const start = target.positionAt(keyOffset);
        const end = target.positionAt(keyOffset + reference.key.split('.').pop()!.length);
        return new vscode.Location(uri, new vscode.Range(start, end));
      }
    });
  }
}
