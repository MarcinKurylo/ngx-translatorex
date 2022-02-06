import * as vscode from 'vscode';
import { Commands } from './commands';

export const activate = async (context: vscode.ExtensionContext) => {
	const commands = [
		Commands.setLanguage(),
		Commands.setPath(),
		Commands.addNewTranslation()
	];

	context.subscriptions.push(...commands);
};

export const deactivate = () => {};
