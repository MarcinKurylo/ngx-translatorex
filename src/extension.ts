import * as vscode from 'vscode';
import { Commands } from './commands';
import { CompletionProviders } from './completionProviders';
import { HoverProviders } from './hoverProviders';
import { flattenObject } from './utils/translationUtils';
import { FileSystemManager } from './utils/fileSystemManager';

/**
 * Extension entry point. Warms up the translations cache and registers all
 * commands, hover and completion providers, wiring their disposables into the
 * extension context subscriptions.
 *
 * @param context The extension context provided by VS Code.
 */
export const activate = async (context: vscode.ExtensionContext) => {
	FileSystemManager.cache = flattenObject(await FileSystemManager.fetchJson());
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
	];

	context.subscriptions.push(...commands, ...hoverProviders, ...completionProviders );
};

/** Extension teardown hook. No cleanup is required. */
export const deactivate = () => {};
