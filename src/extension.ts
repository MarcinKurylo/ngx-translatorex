import * as vscode from 'vscode';
import { Commands } from './commands';
import { CompletionProviders } from './completionProviders';
import { HoverProviders } from './hoverProviders';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { HardcodedStringsProvider } from './hardcodedStringsProvider';
import { DefinitionProviders } from './definitionProviders';
import { EXTENSION_IDENTIFIER } from './const';
import { FileSystemManager } from './utils/fileSystemManager';

/**
 * Extension entry point. Warms up the translations cache, starts watching the
 * i18n file so the cache stays in sync with external edits, and registers all
 * commands, hover and completion providers, wiring their disposables into the
 * extension context subscriptions.
 *
 * @param context The extension context provided by VS Code.
 */
export const activate = async (context: vscode.ExtensionContext) => {
	const diagnostics = DiagnosticsProvider.register();
	const hardcodedStrings = HardcodedStringsProvider.register();
	FileSystemManager.onCacheChanged = () => DiagnosticsProvider.refreshAll();
	await FileSystemManager.refreshCache();
	FileSystemManager.watchTranslationFile();

	const configListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(EXTENSION_IDENTIFIER)) {
			FileSystemManager.watchTranslationFile();
			await FileSystemManager.refreshCache();
			HardcodedStringsProvider.refreshAll();
		}
	});

	const commands = [
		Commands.registerSetLanguage(),
		Commands.registerSetPath(),
		Commands.registerAddNewTranslation(),
		Commands.registerSortJson(),
		Commands.registerSetMode(),
		Commands.registerCreateTranslationKey(),
		Commands.registerShowTranslationReport(),
		Commands.registerRenameTranslationKey(),
		Commands.registerDeleteTranslationKey(),
		Commands.registerExtractHardcodedString(),
		Commands.registerIgnoreHardcodedString()
	];

	const hoverProviders = [
		HoverProviders.registerHtmlHoverProvider()
	];

	const definitionProviders = [
		DefinitionProviders.registerDefinitionProvider()
	];

	const completionProviders = [
		CompletionProviders.registerCompletionProvider()
	];

	context.subscriptions.push(
		...commands,
		...hoverProviders,
		...definitionProviders,
		...completionProviders,
		...diagnostics,
		...hardcodedStrings,
		configListener,
		{ dispose: () => FileSystemManager.disposeWatcher() }
	);
};

/** Extension teardown hook. Disposes the translation file watcher. */
export const deactivate = () => FileSystemManager.disposeWatcher();
