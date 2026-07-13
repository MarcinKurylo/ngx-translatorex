import * as vscode from 'vscode';

/**
 * Thin wrapper over the VS Code Language Model API (`vscode.lm`). Isolates the
 * model selection and request/streaming details so the rest of the extension
 * stays testable and unaware of the API surface. All auto-translation runs on
 * the user's own configured model (e.g. Copilot) — no external MT provider.
 */
export class LanguageModelManager {

  /** Whether the Language Model API is available (VS Code 1.90+ with a provider). */
  public static isAvailable(): boolean {
    return typeof vscode.lm?.selectChatModels === 'function';
  }

  /**
   * Picks the first available chat model, or `undefined` when none is available
   * (no provider installed, or the user declined access).
   */
  public static async selectModel(): Promise<vscode.LanguageModelChat | undefined> {
    try {
      return (await vscode.lm.selectChatModels())[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Sends a single-prompt request to the model and returns the full streamed
   * text. Consent is handled by VS Code on first use.
   *
   * @throws {vscode.LanguageModelError} When the request is refused or fails.
   */
  public static async complete(
    model: vscode.LanguageModelChat,
    prompt: string,
    token: vscode.CancellationToken
  ): Promise<string> {
    const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
    let text = '';
    for await (const part of response.text) {
      text += part;
    }
    return text;
  }
}
