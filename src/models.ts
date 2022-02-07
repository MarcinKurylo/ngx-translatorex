import * as vscode from 'vscode';
export type Selection = {
  text: string,
  languageId: string,
  range: vscode.Range
};