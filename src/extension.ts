import * as vscode from 'vscode';
import { Commands } from './commands';
import { CompletionProviders } from './completionProviders';
import { HoverProviders } from './hoverProviders';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { HardcodedStringsProvider } from './hardcodedStringsProvider';
import { DefinitionProviders } from './definitionProviders';
import { InlineTranslationDecorations } from './inlineTranslationDecorations';
import { TranslationCoverageStatusBar } from './translationCoverageStatusBar';
import { KeyReferenceCodeLensProvider } from './keyReferenceCodeLens';
import { LanguageModelTools } from './languageModelTools';
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
	const inlineTranslations = InlineTranslationDecorations.register();
	const coverageStatusBar = TranslationCoverageStatusBar.register();
	const keyUsageCodeLens = new KeyReferenceCodeLensProvider();
	const codeLenses = keyUsageCodeLens.register();
	FileSystemManager.onCacheChanged = () => {
		DiagnosticsProvider.refreshAll();
		InlineTranslationDecorations.refresh();
		void TranslationCoverageStatusBar.refresh();
	};
	await FileSystemManager.refreshCache();
	FileSystemManager.watchTranslationFile();

	const configListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(EXTENSION_IDENTIFIER)) {
			FileSystemManager.watchTranslationFile();
			await FileSystemManager.refreshCache();
			HardcodedStringsProvider.refreshAll();
			InlineTranslationDecorations.refresh();
			TranslationCoverageStatusBar.watchFiles();
			void TranslationCoverageStatusBar.refresh();
			keyUsageCodeLens.refresh();
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
		Commands.registerIgnoreHardcodedString(),
		Commands.registerShowHardcodedStringsReport(),
		Commands.registerTranslatePlaceholders(),
		Commands.registerExtractTemplateStrings(),
		Commands.registerCleanUnusedKeys()
	];

	const hoverProviders = [
		HoverProviders.registerHtmlHoverProvider()
	];

	const definitionProviders = [
		DefinitionProviders.registerDefinitionProvider()
	];

	const languageModelTools = LanguageModelTools.register();

	const completionProviders = [
		CompletionProviders.registerCompletionProvider()
	];

	context.subscriptions.push(
		...commands,
		...hoverProviders,
		...definitionProviders,
		...inlineTranslations,
		...coverageStatusBar,
		...codeLenses,
		...languageModelTools,
		...completionProviders,
		...diagnostics,
		...hardcodedStrings,
		configListener,
		{ dispose: () => FileSystemManager.disposeWatcher() }
	);
};

/** Extension teardown hook. Disposes the translation file watcher. */
export const deactivate = () => FileSystemManager.disposeWatcher();
