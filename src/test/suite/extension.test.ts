import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const i18nPath = path.resolve(
  __dirname,
  '../../../src/test/fixtures/workspace/src/assets/i18n/en.json'
);

const readI18n = (): any => JSON.parse(fs.readFileSync(i18nPath, 'utf8'));
const writeI18n = (obj: unknown): void =>
  fs.writeFileSync(i18nPath, JSON.stringify(obj, null, 2) + '\n');

const waitFor = async (predicate: () => boolean, timeout = 5000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('waitFor: condition not met within timeout');
};

describe('ngx-translatorex e2e', () => {
  let original: string;

  before(async () => {
    original = fs.readFileSync(i18nPath, 'utf8');
    const ext = vscode.extensions.getExtension('marcinex.ngx-translatorex');
    assert.ok(ext, 'extension should be present');
    await ext!.activate();
  });

  after(() => {
    fs.writeFileSync(i18nPath, original);
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
});
