import * as vscode from "vscode";

/**
 * Sidebar Webview Provider
 *
 * Registers and manages the CodeDrill sidebar webview in the activity bar.
 * This is the primary UI surface -- a chat-based sidebar similar to
 * Cursor/Windsurf agent panels.
 *
 * Responsibilities:
 * - Create and manage the webview
 * - Inject React app HTML/JS/CSS
 * - Handle bidirectional messages between webview and extension host
 * - Manage webview lifecycle
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codedrill.sidebar";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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

  /**
   * Send a message from the extension host to the webview.
   */
  public postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  private _handleMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case "sendMessage": {
        const text = message.text as string;
        this.postMessage({
          type: "chatResponse",
          role: "assistant",
          content: `Echo: ${text}`,
        });
        break;
      }
      case "selectModel": {
        const modelId = message.modelId as string;
        vscode.window.showInformationMessage(`CodeDrill: Model set to ${modelId}`);
        break;
      }
      case "ready": {
        this.postMessage({
          type: "modelsLoaded",
          models: [
            { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "OpenRouter" },
            { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
            { id: "meta-llama/llama-3.1-8b", name: "Llama 3.1 8B", provider: "Ollama (Local)" },
          ],
          defaultModel: "anthropic/claude-sonnet-4",
        });
        break;
      }
      default:
        break;
    }
  }

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
