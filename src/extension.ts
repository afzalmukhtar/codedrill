import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebar-panel";

/**
 * Extension entry point. Called when the extension is activated.
 *
 * Activation events are defined in package.json.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("CodeDrill extension activating...");

  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.openPanel", () => {
      vscode.commands.executeCommand("codedrill.sidebar.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.startSession", () => {
      vscode.window.showInformationMessage(
        "CodeDrill: Practice sessions coming soon!"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.configureProviders", () => {
      vscode.window.showInformationMessage(
        "CodeDrill: Provider configuration coming soon!"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.showDashboard", () => {
      vscode.window.showInformationMessage(
        "CodeDrill: Dashboard coming soon!"
      );
    })
  );

  console.log("CodeDrill extension activated.");
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  console.log("CodeDrill extension deactivated.");
}
