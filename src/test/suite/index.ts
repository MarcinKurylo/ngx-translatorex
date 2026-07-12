import * as path from 'path';
import * as fs from 'fs';
import * as Mocha from 'mocha';

/**
 * Discovers every compiled `*.test.js` file under this directory (the e2e
 * suite) and runs them through Mocha inside the VS Code extension host.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname);

  const findTestFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findTestFiles(full);
      }
      return entry.name.endsWith('.test.js') ? [full] : [];
    });

  return new Promise((resolve, reject) => {
    try {
      findTestFiles(testsRoot).forEach((file) => mocha.addFile(file));
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
