import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { HTML_SCAN_EXCLUDE } from './const';
import { findTranslateKeys } from './utils/diagnosticsUtils';

/** Position of an offset within text, computed without a `TextDocument`. */
export const positionAt = (text: string, offset: number): vscode.Position => {
  const before = text.slice(0, offset);
  return new vscode.Position(before.split('\n').length - 1, offset - (before.lastIndexOf('\n') + 1));
};

/**
 * Builds a `key → usage-locations` index by scanning every template and
 * component in the workspace (reusing the diagnostics' key detection). Shared by
 * the usage-count CodeLens and the unused-key cleanup so both see the same
 * references. Only string-literal keys are found — dynamically built keys are
 * invisible, so a key with no locations is "unreferenced as far as we can see".
 */
export const buildUsageIndex = async (): Promise<Map<string, vscode.Location[]>> => {
  const decoder = new TextDecoder();
  const index = new Map<string, vscode.Location[]>();
  const uris = await vscode.workspace.findFiles('**/*.{html,ts}', HTML_SCAN_EXCLUDE);
  for (const uri of uris) {
    try {
      const text = decoder.decode(await vscode.workspace.fs.readFile(uri));
      const languageId = uri.path.endsWith('.ts') ? 'typescript' : 'html';
      for (const ref of findTranslateKeys(text, languageId)) {
        const range = new vscode.Range(positionAt(text, ref.index), positionAt(text, ref.index + ref.length));
        const locations = index.get(ref.key) ?? [];
        locations.push(new vscode.Location(uri, range));
        index.set(ref.key, locations);
      }
    } catch {
      // Unreadable file — skip it.
    }
  }
  return index;
};
