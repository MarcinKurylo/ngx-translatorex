import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MISSING_TRANSLATION_PLACEHOLDER } from '../../const';

const i18nDir = path.resolve(
  __dirname,
  '../../../src/test/fixtures/workspace/src/assets/i18n'
);
const i18nPath = path.join(i18nDir, 'en.json');
const plPath = path.join(i18nDir, 'pl.json');

const readI18n = (): any => JSON.parse(fs.readFileSync(i18nPath, 'utf8'));
const writeI18n = (obj: unknown): void =>
  fs.writeFileSync(i18nPath, JSON.stringify(obj, null, 2) + '\n');
const readPl = (): any => JSON.parse(fs.readFileSync(plPath, 'utf8'));
const writePl = (obj: unknown): void =>
  fs.writeFileSync(plPath, JSON.stringify(obj, null, 2) + '\n');

const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  timeout = 5000
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('waitFor: condition not met within timeout');
};

describe('ngx-translatorex e2e', () => {
  let original: string;
  let originalPl: string;

  before(async () => {
    original = fs.readFileSync(i18nPath, 'utf8');
    originalPl = fs.readFileSync(plPath, 'utf8');
    const ext = vscode.extensions.getExtension('marcinex.ngx-translatorex');
    assert.ok(ext, 'extension should be present');
    await ext!.activate();
  });

  after(() => {
    fs.writeFileSync(i18nPath, original);
    fs.writeFileSync(plPath, originalPl);
  });

  it('sortJson sorts the i18n file alphabetically', async () => {
    writeI18n({ zebra: 'z', alpha: 'a', mango: 'm' });
    await vscode.commands.executeCommand('ngx-translatorex.sortJson');
    await waitFor(() => Object.keys(readI18n())[0] === 'alpha');
    assert.deepStrictEqual(Object.keys(readI18n()), ['alpha', 'mango', 'zebra']);
  });

  it('addNewTranslation writes the selection under the given key', async () => {
    writeI18n({ home: { title: 'Home' } });

    const doc = await vscode.workspace.openTextDocument({
      content: 'Hello world',
      language: 'typescript'
    });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(
      new vscode.Position(0, 0),
      new vscode.Position(0, 'Hello world'.length)
    );

    const originalInputBox = vscode.window.showInputBox;
    (vscode.window as any).showInputBox = async () => 'greeting.hello';
    try {
      await vscode.commands.executeCommand('ngx-translatorex.addNewTranslation');
      await waitFor(() => readI18n().greeting?.hello === 'Hello world');
    } finally {
      (vscode.window as any).showInputBox = originalInputBox;
    }

    assert.strictEqual(readI18n().greeting.hello, 'Hello world');
    await waitFor(() => doc.getText().includes('greeting.hello'));
    assert.ok(doc.getText().includes('greeting.hello'), 'editor selection replaced with the key');
  });

  it('addNewTranslation syncs the key to other languages with a placeholder', async () => {
    writeI18n({ home: { title: 'Home' } });
    writePl({ home: { title: 'Start' } });

    const doc = await vscode.workspace.openTextDocument({
      content: 'Hello world',
      language: 'typescript'
    });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(
      new vscode.Position(0, 0),
      new vscode.Position(0, 'Hello world'.length)
    );

    const originalInputBox = vscode.window.showInputBox;
    (vscode.window as any).showInputBox = async () => 'greeting.hello';
    try {
      await vscode.commands.executeCommand('ngx-translatorex.addNewTranslation');
      await waitFor(() => readPl().greeting?.hello === MISSING_TRANSLATION_PLACEHOLDER);
    } finally {
      (vscode.window as any).showInputBox = originalInputBox;
    }

    assert.strictEqual(readI18n().greeting.hello, 'Hello world', 'main language gets the real value');
    assert.strictEqual(
      readPl().greeting.hello,
      MISSING_TRANSLATION_PLACEHOLDER,
      'other language gets the placeholder'
    );
    assert.strictEqual(readPl().home.title, 'Start', 'existing key in other language is left untouched');
  });

  it('hover provider shows the translation for a key', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: `<p>{{ 'home.title' | translate }}</p>`,
      language: 'html'
    });
    await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(0, doc.getText().indexOf('home.title') + 2);

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos
    );
    const text = hovers
      .flatMap((h) => h.contents)
      .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
      .join('\n');

    assert.ok(text.includes('home.title'), 'hover mentions the key');
    assert.ok(text.includes('Home'), 'hover shows the translated value');
  });

  it('completion provider suggests cached keys prefixed with t.', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: ' ',
      language: 'html'
    });
    await vscode.window.showTextDocument(doc);

    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(0, 1)
    );
    const labels = list.items.map((i) =>
      typeof i.label === 'string' ? i.label : i.label.label
    );

    assert.ok(labels.includes('t.home.title'), 'completion offers the cached key');
  });

  it('watcher refreshes the cache when the i18n file changes externally', async () => {
    writeI18n({ external: { added: 'Added externally' } });

    const suggestsExternalKey = async (): Promise<boolean> => {
      const doc = await vscode.workspace.openTextDocument({ content: ' ', language: 'html' });
      await vscode.window.showTextDocument(doc);
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(0, 1)
      );
      return list.items.some((i) =>
        (typeof i.label === 'string' ? i.label : i.label.label) === 't.external.added'
      );
    };

    await waitFor(async () => await suggestsExternalKey(), 8000);
    assert.ok(await suggestsExternalKey(), 'completion reflects the externally added key');
  });

  it('flags only translate keys missing from the i18n file', async () => {
    writeI18n({ home: { title: 'Home' } });
    const doc = await vscode.workspace.openTextDocument({
      content: `{{ 'home.title' | translate }} {{ 'missing.key' | translate }}`,
      language: 'html'
    });
    await vscode.window.showTextDocument(doc);

    const ourDiagnostics = () =>
      vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source === 'ngx-translatorex');

    await waitFor(
      () => ourDiagnostics().length === 1 && String(ourDiagnostics()[0].code) === 'missing.key',
      8000
    );
    const diagnostics = ourDiagnostics();
    assert.strictEqual(diagnostics.length, 1, 'the existing key is not flagged');
    assert.strictEqual(String(diagnostics[0].code), 'missing.key');
    assert.ok(diagnostics[0].message.includes('missing.key'), 'message names the key');
  });

  it('offers a "Create i18n key" quick fix for a missing key', async () => {
    writeI18n({ home: { title: 'Home' } });
    const doc = await vscode.workspace.openTextDocument({
      content: `{{ 'needs.creating' | translate }}`,
      language: 'html'
    });
    await vscode.window.showTextDocument(doc);

    const ourDiagnostics = () =>
      vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source === 'ngx-translatorex');
    await waitFor(() => ourDiagnostics().length === 1, 8000);

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      ourDiagnostics()[0].range
    );
    const titles = actions.map((a) => a.title);
    assert.ok(
      titles.includes(`Create i18n key 'needs.creating'`),
      `quick fix offered (got: ${titles.join(', ')})`
    );
  });

  it('showTranslationReport lists missing and untranslated keys per language', async () => {
    writeI18n({ home: { title: 'Home', welcome: 'Welcome' }, common: { save: 'Save' } });
    writePl({ home: { title: 'Start', welcome: MISSING_TRANSLATION_PLACEHOLDER } });

    await vscode.commands.executeCommand('ngx-translatorex.showTranslationReport');
    await waitFor(
      () => vscode.window.activeTextEditor?.document.languageId === 'markdown',
      8000
    );

    const report = vscode.window.activeTextEditor!.document.getText();
    assert.ok(report.includes('# Translation report'), 'renders a report heading');
    assert.ok(report.includes('## pl'), 'has a section for pl');
    assert.ok(report.includes('common.save'), 'lists the key missing from pl');
    assert.ok(report.includes('home.welcome'), 'lists the untranslated placeholder key');
    assert.ok(/##\s+en[\s\S]*Fully translated/.test(report), 'marks the main language as fully translated');
  });
});
