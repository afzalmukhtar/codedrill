import * as vscode from "vscode";
import type { ConfigManager } from "../utils/config";
import type { LLMRouter } from "../ai/llm-router";
import type { ChatMessage } from "../ai/providers/types";

/**
 * Sidebar Webview Provider
 *
 * Registers and manages the CodeDrill sidebar webview in the activity bar.
 * Handles bidirectional message passing between the React webview and the
 * extension host, including real AI chat via the LLM Router.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codedrill.sidebar";

  private _view?: vscode.WebviewView;
  private _selectedModel: string = "";
  private _mode: string = "agent";
  private _conversationHistory: ChatMessage[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _configManager: ConfigManager,
    private readonly _router: LLMRouter,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      this._handleMessage(message);
    });
  }

  /** Send a message from the extension host to the webview. */
  public postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  /** Re-initialise the router and push updated models to the webview. */
  public async refreshModels(): Promise<void> {
    const config = await this._configManager.loadConfig();
    await this._router.initialize(config.providers);
    this._sendModelsToWebview();
  }

  // ================================================================
  // Message handler
  // ================================================================

  private async _handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case "ready":
        await this._onReady();
        break;

      case "sendMessage":
        await this._onSendMessage(message.text as string);
        break;

      case "selectModel":
        this._selectedModel = message.modelId as string;
        break;

      case "setMode":
        this._mode = (message.mode as string) || "agent";
        break;

      case "configureProviders":
        await this._onConfigureProviders();
        break;

      default:
        break;
    }
  }

  // ================================================================
  // ready -- init config + router, send models
  // ================================================================

  private async _onReady(): Promise<void> {
    try {
      const config = await this._configManager.loadConfig();
      await this._router.initialize(config.providers);
      this._sendModelsToWebview();
    } catch (err) {
      console.error("[SidebarProvider] Error during ready:", err);
      this.postMessage({ type: "modelsLoaded", models: [], defaultModel: "" });
    }
  }

  private _sendModelsToWebview(): void {
    const models = this._router.getAvailableModels();
    const config = this._configManager.config;
    const defaultModel = config.defaultModel ?? (models.length > 0 ? models[0].id : "");

    if (!this._selectedModel && defaultModel) {
      this._selectedModel = defaultModel;
    }

    this.postMessage({
      type: "modelsLoaded",
      models: models.map((m) => ({ id: m.id, name: m.name, provider: m.provider })),
      defaultModel: this._selectedModel || defaultModel,
    });
  }

  // ================================================================
  // sendMessage -- stream real AI response
  // ================================================================

  private async _onSendMessage(text: string): Promise<void> {
    if (!text?.trim()) { return; }

    // Add user message to history
    this._conversationHistory.push({ role: "user", content: text.trim() });

    if (!this._router.hasProviders) {
      this.postMessage({
        type: "chatError",
        message: "No AI providers configured. Open codedrill.config.json to set one up.",
      });
      return;
    }

    if (!this._selectedModel) {
      const models = this._router.getAvailableModels();
      if (models.length > 0) {
        this._selectedModel = models[0].id;
      } else {
        this.postMessage({
          type: "chatError",
          message: "No models available. Make sure Ollama is running with at least one model installed.",
        });
        return;
      }
    }

    try {
      const stream = this._router.chat({
        model: this._selectedModel,
        messages: this._conversationHistory,
        systemPrompt: this._getSystemPrompt(),
        stream: true,
        temperature: 0.7,
      });

      let fullContent = "";

      for await (const chunk of stream) {
        if (chunk.type === "content" && chunk.content) {
          fullContent += chunk.content;
          this.postMessage({ type: "chatChunk", content: chunk.content });
        } else if (chunk.type === "error") {
          this.postMessage({ type: "chatError", message: chunk.error ?? "Unknown error" });
          return;
        }
      }

      // Add assistant response to conversation history
      if (fullContent) {
        this._conversationHistory.push({ role: "assistant", content: fullContent });
      }

      this.postMessage({ type: "chatDone" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[SidebarProvider] Chat error:", errMsg);
      this.postMessage({ type: "chatError", message: errMsg });
    }
  }

  // ================================================================
  // System prompts per mode
  // ================================================================

  private _getSystemPrompt(): string {
    switch (this._mode) {
      case "teach":
        return (
          "You are CodeDrill in Teach mode. You are a patient, thorough coding teacher. " +
          "Explain concepts step by step with examples. Focus on building deep understanding " +
          "of algorithms, data structures, and system design. Use analogies and diagrams (ASCII) " +
          "when helpful. Ask the student questions to check understanding."
        );
      case "interview":
        return (
          "You are CodeDrill in Interview mode. You are a realistic coding interviewer. " +
          "Present problems, give hints only when asked (escalating from subtle to direct), " +
          "ask clarifying questions, probe edge cases, and evaluate solutions. " +
          "Never give the answer directly. Guide the candidate using the Socratic method."
        );
      case "agent":
      default:
        return (
          "You are CodeDrill, an expert coding interview coach. " +
          "Help the user understand algorithms, data structures, and system design. " +
          "Be concise, encouraging, and provide clear explanations."
        );
    }
  }

  // ================================================================
  // configureProviders -- open config file in editor
  // ================================================================

  private async _onConfigureProviders(): Promise<void> {
    const uri = this._configManager.getConfigFileUri();
    if (!uri) {
      vscode.window.showWarningMessage("No workspace folder open.");
      return;
    }

    try {
      // Try to open the existing config file
      await vscode.workspace.fs.stat(uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch {
      // File doesn't exist -- create from example
      const exampleUri = vscode.Uri.joinPath(this._extensionUri, "codedrill.config.example.json");
      try {
        const exampleContent = await vscode.workspace.fs.readFile(exampleUri);
        await vscode.workspace.fs.writeFile(uri, exampleContent);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          "Created codedrill.config.json from example. Edit providers and reload."
        );
      } catch {
        vscode.window.showErrorMessage(
          "Could not create config file. Create codedrill.config.json manually in your workspace root."
        );
      }
    }
  }

  // ================================================================
  // HTML generation
  // ================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>CodeDrill</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
