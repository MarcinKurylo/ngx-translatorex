// Redirects `require('vscode')` to a local mock so the extension modules can be
// loaded in a plain Node process during unit tests.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./vscode-mock');
  }
  return originalLoad.apply(this, arguments);
};
