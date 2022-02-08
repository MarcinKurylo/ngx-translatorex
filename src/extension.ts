import * as vscode from 'vscode';
import { Commands } from './commands';
import { ExtensionUtils } from './utils/extensionUtils';
import { FileSystemManager } from './utils/fileSytemManager';

export const activate = async (context: vscode.ExtensionContext) => {
	FileSystemManager.cache = ExtensionUtils.flattenObject(await FileSystemManager.fetchJson());
	const commands = [
		Commands.registerSetLanguage(),
		Commands.registerSetPath(),
		Commands.registerAddNewTranslation(),
		Commands.registerSortJson(),
		Commands.registerSetMode()
	];

	context.subscriptions.push(...commands,vscode.languages.registerHoverProvider('html', {
		provideHover(document, position, token) {
			const line = position.line
			const range = document.lineAt(line).range
			const text = document.getText(range);
			const translateTest = new RegExp(/{{.*?'([A-Za-z0-9_\\.]+)'.*?\|.*?translate.*?}}/, 'g');
			const matches = [...text.matchAll(translateTest)];
			let hoveredMatch;
			for (const match of matches) {
				const matchStart = match.index!;
				const matchEnd = matchStart + match[0].length;
				if (matchStart <= position.character && matchEnd >= position.character) {
					hoveredMatch = match[1];
					break;
				}

			}
			if (hoveredMatch) {
				return new vscode.Hover(`${FileSystemManager.cache[hoveredMatch] ??' No value for this key!'}`);
			}
		}
	}));
};

export const deactivate = () => {};
