import * as vscode from 'vscode';
import { Commands } from './commands';

export const activate = async (context: vscode.ExtensionContext) => {
	const commands = [
		Commands.registerSetLanguage(),
		Commands.registerSetPath(),
		Commands.registerAddNewTranslation(),
		Commands.registerSortJson(),
		Commands.registerSetMode()
	];

	context.subscriptions.push(...commands);
};

export const deactivate = () => {};
