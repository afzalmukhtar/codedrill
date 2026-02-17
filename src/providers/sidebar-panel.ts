import * as vscode from "vscode";
import type { ConfigManager } from "../utils/config";
import type { LLMRouter } from "../ai/llm-router";
import type { ChatMessage } from "../ai/providers/types";
import type { PromptContext } from "../ai/personas/prompt-loader";
import { PersonaRouter } from "../ai/personas/persona-router";
import { ChatStorage, type ChatSession } from "../storage/chat-storage";
import { ContextEngine } from "../context/context-engine";

/**
 * Sidebar Webview Provider
 *
 * Manages the CodeDrill sidebar webview. Handles:
 * - Bidirectional message passing with the React UI
 * - Streaming AI chat via LLM Router (with interrupt support)
 * - Persistent chat history via ChatStorage
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codedrill.sidebar";

  private _view?: vscode.WebviewView;
  private _selectedModel: string = "";
  private _mode: string = "agent";
  private _conversationHistory: ChatMessage[] = [];
  private _activeChatId: string | null = null;
  private _chatStorage: ChatStorage;

  // AbortController for the current streaming request
  private _abortController: AbortController | null = null;

  private readonly _contextEngine: ContextEngine;
  private readonly _personaRouter: PersonaRouter;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _configManager: ConfigManager,
    private readonly _router: LLMRouter,
  ) {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    this._chatStorage = new ChatStorage(workspaceUri);
    this._contextEngine = new ContextEngine();
    this._personaRouter = new PersonaRouter(this._extensionUri);
  }

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

  public postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

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

      case "interrupt":
        this._onInterrupt();
        break;

      case "selectModel":
        this._selectedModel = message.modelId as string;
        break;

      case "setMode":
        this._mode = (message.mode as string) || "agent";
        break;

      case "newChat":
        this._onNewChat();
        break;

      case "listChats":
        await this._onListChats();
        break;

      case "loadChat":
        await this._onLoadChat(message.chatId as string);
        break;

      case "deleteChat":
        await this._onDeleteChat(message.chatId as string);
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
  // interrupt -- abort the current stream
  // ================================================================

  private _onInterrupt(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.postMessage({ type: "chatInterrupted" });
  }

  // ================================================================
  // sendMessage -- stream real AI response (with abort support)
  // ================================================================

  private async _onSendMessage(text: string): Promise<void> {
    if (!text?.trim()) { return; }

    // If there's an active stream, abort it first
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    // Add user message to history
    this._conversationHistory.push({ role: "user", content: text.trim() });

    if (!this._router.hasProviders) {
      this.postMessage({
        type: "chatError",
        message: "No AI providers configured. Click the + button next to the model selector to set up a provider.",
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

    // Create a new AbortController for this request
    const abortController = new AbortController();
    this._abortController = abortController;

    // Gather IDE context (active file, selection, cursor surroundings)
    const contextAttachments = this._contextEngine.gatherAutoContext();
    const systemPrompt = await this._getSystemPrompt(contextAttachments);

    // Send context badges to the webview for display
    this.postMessage({
      type: "contextAttached",
      badges: contextAttachments.map((a) => ({
        type: a.type,
        label: a.label,
        tokenEstimate: a.tokenEstimate,
      })),
    });

    try {
      const stream = this._router.chat({
        model: this._selectedModel,
        messages: this._conversationHistory,
        systemPrompt,
        stream: true,
        temperature: 0.7,
      });

      let fullContent = "";

      for await (const chunk of stream) {
        // Check if we've been aborted
        if (abortController.signal.aborted) {
          break;
        }

        if (chunk.type === "content" && chunk.content) {
          fullContent += chunk.content;
          this.postMessage({ type: "chatChunk", content: chunk.content });
        } else if (chunk.type === "error") {
          this.postMessage({ type: "chatError", message: chunk.error ?? "Unknown error" });
          this._abortController = null;
          return;
        }
      }

      // Add assistant response to conversation history (even if partial from interrupt)
      if (fullContent) {
        this._conversationHistory.push({ role: "assistant", content: fullContent });
      }

      if (abortController.signal.aborted) {
        this.postMessage({ type: "chatInterrupted" });
      } else {
        this.postMessage({ type: "chatDone" });
      }

      // Auto-save after each exchange
      await this._autoSaveChat();
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        this.postMessage({ type: "chatInterrupted" });
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[SidebarProvider] Chat error:", errMsg);
      this.postMessage({ type: "chatError", message: errMsg });
    } finally {
      if (this._abortController === abortController) {
        this._abortController = null;
      }
    }
  }

  // ================================================================
  // Chat management
  // ================================================================

  private _onNewChat(): void {
    // Save current chat before starting new one
    this._autoSaveChat();

    this._conversationHistory = [];
    this._activeChatId = null;
  }

  private async _onListChats(): Promise<void> {
    const chats = await this._chatStorage.listChats();
    this.postMessage({ type: "chatHistoryList", chats });
  }

  private async _onLoadChat(chatId: string): Promise<void> {
    // Save current chat first
    await this._autoSaveChat();

    const session = await this._chatStorage.loadChat(chatId);
    if (!session) {
      this.postMessage({ type: "chatError", message: "Chat not found." });
      return;
    }

    this._activeChatId = session.id;
    this._mode = session.mode;
    this._conversationHistory = session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    this.postMessage({
      type: "chatLoaded",
      chatId: session.id,
      messages: session.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        isStreaming: false,
      })),
      mode: session.mode,
    });
  }

  private async _onDeleteChat(chatId: string): Promise<void> {
    await this._chatStorage.deleteChat(chatId);
    if (this._activeChatId === chatId) {
      this._activeChatId = null;
      this._conversationHistory = [];
    }
  }

  /**
   * Auto-save the current conversation to disk.
   * Creates a new chat file if one doesn't exist yet.
   */
  private async _autoSaveChat(): Promise<void> {
    if (this._conversationHistory.length === 0) { return; }

    const now = Date.now();

    if (!this._activeChatId) {
      this._activeChatId = ChatStorage.newId();
      this.postMessage({ type: "chatCreated", chatId: this._activeChatId });
    }

    const firstUserMsg = this._conversationHistory.find((m) => m.role === "user");
    const title = firstUserMsg
      ? ChatStorage.generateTitle(firstUserMsg.content)
      : "New chat";

    const session: ChatSession = {
      id: this._activeChatId,
      title,
      mode: this._mode,
      model: this._selectedModel,
      createdAt: this._conversationHistory[0]
        ? now
        : now,
      updatedAt: now,
      messages: this._conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: now,
      })),
    };

    try {
      await this._chatStorage.saveChat(session);
    } catch (err) {
      console.error("[SidebarProvider] Failed to save chat:", err);
    }
  }

  // ================================================================
  // System prompts per mode
  // ================================================================

  private async _getSystemPrompt(contextAttachments: ReturnType<ContextEngine["gatherAutoContext"]>): Promise<string> {
    const context = this._buildPromptContext(contextAttachments);
    return this._personaRouter.getPromptForMode(this._mode, context);
  }

  private _buildPromptContext(
    contextAttachments: ReturnType<ContextEngine["gatherAutoContext"]>,
  ): PromptContext {
    const fileAttachment = contextAttachments.find((a) => a.type === "file");
    const selectionAttachment = contextAttachments.find((a) => a.type === "selection");

    return {
      filePath: fileAttachment?.metadata?.filePath,
      language: fileAttachment?.metadata?.language,
      fileContent: fileAttachment?.content,
      selection: selectionAttachment?.content,
    };
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
      await vscode.workspace.fs.stat(uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch {
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
