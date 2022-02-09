import * as vscode from 'vscode';
import { Commands } from './commands';
import { CompletionProviders } from './completionProviders';
import { HoverProviders } from './hoverProviders';
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

	const hoverProviders = [
		HoverProviders.registerHtmlHoverProvider()
	];

	const completionProviders = [
		CompletionProviders.registerCompletionProvider()
	]

	context.subscriptions.push(...commands, ...hoverProviders, ...completionProviders );
};

export const deactivate = () => {};
