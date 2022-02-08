import * as vscode from 'vscode';
export class NotificationManager {
  public static showInfoMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  public static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}