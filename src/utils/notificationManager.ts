import * as vscode from 'vscode';
export class NotificationManager {
  /**
   * Shows an information toast in the VS Code window.
   *
   * @param message The message to display.
   */
  public static showInfoMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  /**
   * Shows an error toast in the VS Code window.
   *
   * @param message The message to display.
   */
  public static showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}