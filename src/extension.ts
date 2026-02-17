import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebar-panel";
import { ConfigManager } from "./utils/config";
import { LLMRouter } from "./ai/llm-router";

/**
 * Extension entry point. Called when the extension is activated.
 *
 * Activation events are defined in package.json.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log("CodeDrill extension activating...");

  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;

  const configManager = new ConfigManager(workspaceUri, context.extensionUri);
  const router = new LLMRouter();
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    configManager,
    router,
  );

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
    vscode.commands.registerCommand("codedrill.configureProviders", async () => {
      const configUri = configManager.getConfigFileUri();
      if (!configUri) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      try {
        await vscode.workspace.fs.stat(configUri);
        const doc = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(doc);
      } catch {
        // Config file doesn't exist -- create from the example
        const exampleUri = vscode.Uri.joinPath(context.extensionUri, "codedrill.config.example.json");
        try {
          const exampleContent = await vscode.workspace.fs.readFile(exampleUri);
          await vscode.workspace.fs.writeFile(configUri, exampleContent);
          const doc = await vscode.workspace.openTextDocument(configUri);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(
            "Created codedrill.config.json from example. Edit providers and reload."
          );
        } catch {
          vscode.window.showErrorMessage(
            "Could not create config file. Create codedrill.config.json manually."
          );
        }
      }
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
