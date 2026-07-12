import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// When run from VS Code's integrated terminal, ELECTRON_RUN_AS_NODE=1 is
		// inherited and would make the test VS Code binary behave as plain Node
		// (it tries to `require` the workspace path). Drop it so the child launches
		// the real editor. Harmless in CI, where the variable isn't set.
		delete process.env.ELECTRON_RUN_AS_NODE;

		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// A fixture Angular workspace with an i18n file, so the extension
		// activates (workspaceContains:angular.json) and has data to work on.
		const workspacePath = path.resolve(__dirname, '../../src/test/fixtures/workspace');

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspacePath, '--disable-extensions']
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
