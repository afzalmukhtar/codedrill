import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebar-panel";
import { ConfigManager } from "./utils/config";
import { LLMRouter } from "./ai/llm-router";
import { ProblemBank } from "./core/problem-bank";
import { ProblemGeneratorPersona } from "./ai/personas/problem-generator";
import { clearTemplateCache } from "./ai/personas/prompt-loader";

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
  const problemBank = new ProblemBank(context.extensionUri, workspaceUri);
  const problemGenerator = new ProblemGeneratorPersona(context.extensionUri);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    configManager,
    router,
    context.subscriptions,
    problemBank,
    problemGenerator,
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
      getTodaysProblem(
        configManager,
        router,
        problemBank,
        problemGenerator,
        sidebarProvider,
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

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.reloadPrompts", () => {
      clearTemplateCache();
      vscode.window.showInformationMessage("CodeDrill: Prompt template cache cleared.");
    })
  );

  console.log("CodeDrill extension activated.");
}

/**
 * "Get Today's Problem" flow:
 *   1. Ensure config + router are ready
 *   2. Load ProblemBank from configured lists
 *   3. Select a problem
 *   4. Generate a full markdown problem statement via LLM
 *   5. Write to .codedrill/problems/YYYY-MM-DD/{slug}.md
 *   6. Open the file in the editor
 *   7. Notify sidebar webview
 */
async function getTodaysProblem(
  configManager: ConfigManager,
  router: LLMRouter,
  problemBank: ProblemBank,
  problemGenerator: ProblemGeneratorPersona,
  sidebarProvider: SidebarProvider,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CodeDrill: Generating your problem...",
      cancellable: true,
    },
    async (progress, token) => {
      try {
        // 1. Load config and init router
        progress.report({ message: "Loading configuration..." });
        const config = await configManager.loadConfig();
        await router.initialize(config.providers);

        if (!router.hasProviders) {
          vscode.window.showErrorMessage(
            "No AI providers configured. Run 'CodeDrill: Configure Providers' first.",
          );
          return;
        }

        const model = config.defaultModel
          ?? router.getAvailableModels()[0]?.id;
        if (!model) {
          vscode.window.showErrorMessage(
            "No models available. Make sure your AI provider is running.",
          );
          return;
        }

        // 2. Initialize ProblemBank
        progress.report({ message: "Loading problem lists..." });

        const prefs = config.preferences ?? {};
        const listNames = Array.isArray(prefs.problemLists)
          ? (prefs.problemLists as string[])
          : ["blind75"];
        const language = typeof prefs.preferredLanguage === "string"
          ? prefs.preferredLanguage
          : "python";

        await problemBank.initialize(listNames);

        if (problemBank.problemCount === 0) {
          vscode.window.showErrorMessage(
            "No problems loaded. Check your problemLists config.",
          );
          return;
        }

        // 3. Select a problem
        progress.report({ message: "Selecting a problem..." });
        const entry = problemBank.selectProblem();
        if (!entry) {
          vscode.window.showErrorMessage("Could not select a problem.");
          return;
        }

        if (token.isCancellationRequested) { return; }

        // 4. Generate problem markdown via LLM
        progress.report({ message: `Generating "${entry.title}"...` });

        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());

        const markdown = await problemGenerator.generateProblem(
          entry,
          language,
          router,
          model,
          abortController.signal,
        );

        if (token.isCancellationRequested) { return; }

        if (!markdown) {
          vscode.window.showErrorMessage(
            "Failed to generate the problem. Check your AI provider connection.",
          );
          return;
        }

        // 5. Write to .codedrill/problems/YYYY-MM-DD/{slug}.md
        progress.report({ message: "Saving problem file..." });

        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceUri) {
          vscode.window.showErrorMessage("No workspace folder open.");
          return;
        }

        const today = new Date();
        const dateStr = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");

        const problemDir = vscode.Uri.joinPath(
          workspaceUri,
          ".codedrill",
          "problems",
          dateStr,
        );

        try {
          await vscode.workspace.fs.stat(problemDir);
        } catch {
          await vscode.workspace.fs.createDirectory(problemDir);
        }

        const fileUri = vscode.Uri.joinPath(problemDir, `${entry.slug}.md`);
        await vscode.workspace.fs.writeFile(
          fileUri,
          new TextEncoder().encode(markdown),
        );

        // 6. Mark as seen
        await problemBank.markSeen(entry.slug);

        // 7. Open in editor
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          preview: false,
        });

        // 8. Notify sidebar and store active problem
        const problemMeta = {
          slug: entry.slug,
          title: entry.title,
          difficulty: entry.difficulty,
          category: entry.category,
          filePath: fileUri.fsPath,
        };
        sidebarProvider.setActiveProblem(problemMeta);
        sidebarProvider.postMessage({
          type: "problemLoaded",
          problem: problemMeta,
        });

        vscode.window.showInformationMessage(
          `CodeDrill: "${entry.title}" is ready! Good luck!`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[CodeDrill] getTodaysProblem error:", msg);
        vscode.window.showErrorMessage(`CodeDrill: ${msg}`);
      }
    },
  );
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  console.log("CodeDrill extension deactivated.");
}
