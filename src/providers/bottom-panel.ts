/**
 * Bottom Panel Webview Provider
 *
 * Registers and manages the main CodeDrill bottom panel webview.
 * This is the primary UI surface, similar to Cline/Codex panels.
 *
 * Layout:
 * - Left pane (40%): Problem statement, timer, session info
 * - Right pane (60%): Chat messages, code blocks, context badges
 * - Bottom bar: Model selector, token count, chat input
 *
 * Responsibilities:
 * - Create and manage the webview panel
 * - Handle messages between webview and extension host
 * - Inject React webview HTML/JS/CSS
 * - Manage webview lifecycle
 */

// import * as vscode from "vscode";

export class BottomPanelProvider /* implements vscode.WebviewViewProvider */ {
  // TODO: resolveWebviewView(webviewView): void
  // TODO: postMessage(message: WebviewMessage): void
  // TODO: onMessage(handler): vscode.Disposable
  // TODO: getHtml(webview: vscode.Webview): string
}
