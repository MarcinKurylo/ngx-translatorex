import * as vscode from 'vscode';
import { Commands } from './commands';

const getURI = async () => {
	const uris = await vscode.workspace.findFiles('**/assets/i18n/en.json')
	if (uris) {
		return uris[0].path
	} else {
		vscode.window.showErrorMessage('No file with translations found')
	}
};

const getConfig = (key: string) => {
	return vscode.workspace.getConfiguration('ngx-translatorex').get(key) as string;
};

const readFile = () => {

};

export const activate = async (context: vscode.ExtensionContext) => {
	const commands = [
		Commands.setLanguage(),
		Commands.setPath(),
		Commands.addNewTranslation()
	];

	context.subscriptions.push(...commands);
};

export const deactivate = () => {};
