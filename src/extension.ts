import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebar-panel";
import { ConfigManager } from "./utils/config";
import { LLMRouter } from "./ai/llm-router";
import { Repository } from "./db/repository";
import { Scheduler } from "./core/scheduler";
import { ProblemBank } from "./core/problem-bank";
import { PrefetchPipeline } from "./core/prefetch-pipeline";
import { LeetCodeClient } from "./leetcode/client";
import { ProblemGeneratorPersona } from "./ai/personas/problem-generator";
import { SessionManager } from "./core/session-manager";
import { ProblemMutator } from "./core/problem-mutator";
import { WorkspaceManager } from "./core/workspace-manager";
import { clearTemplateCache } from "./ai/personas/prompt-loader";
import { generateTestCases, extractTestGenInput } from "./core/test-generator";

/** Module-level cancellation source for the session generation flow. */
let sessionCancellation: vscode.CancellationTokenSource | null = null;

/** Prefetch pipeline instance for background description fetching. */
let prefetchPipeline: PrefetchPipeline | null = null;

/** Retained for cleanup during deactivation. */
let sidebarRef: SidebarProvider | null = null;
let repositoryRef: Repository | null = null;

/** Called by the sidebar when the user clicks Cancel in the webview. */
export function cancelSessionGeneration(): void {
  if (sessionCancellation) {
    sessionCancellation.cancel();
    sessionCancellation.dispose();
    sessionCancellation = null;
  }
}

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
  const repository = new Repository();
  const leetcodeClient = new LeetCodeClient();
  const problemBank = new ProblemBank(repository, leetcodeClient, context.extensionUri);
  const problemGenerator = new ProblemGeneratorPersona(context.extensionUri);
  const problemMutator = new ProblemMutator(context.extensionUri);
  const workspaceManager = new WorkspaceManager(repository, workspaceUri ? vscode.Uri.joinPath(workspaceUri) : null);

  // Initialize repository in the background (don't block activation)
  const repoReady = repository.initialize(context.extensionUri, workspaceUri).then(async () => {
    console.log("[CodeDrill] Repository initialized");
    await problemBank.initialize();
    console.log("[CodeDrill] Problem bank initialized");
  }).catch((err) => {
    console.error("[CodeDrill] Repository init failed:", err);
  });

  prefetchPipeline = new PrefetchPipeline(problemBank, repository);
  repoReady.then(() => prefetchPipeline?.start()).catch(() => {});

  const scheduler = new Scheduler(repository);
  const sessionManager = new SessionManager(repository, scheduler, problemBank);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    configManager,
    router,
    context.subscriptions,
    problemBank,
    problemGenerator,
    sessionManager,
    repository,
  );

  sidebarRef = sidebarProvider;
  repositoryRef = repository;

  context.subscriptions.push({
    dispose: () => {
      sidebarProvider.dispose();
      repository.close();
    },
  });

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
      prefetchPipeline?.stop();
      repoReady.then(() => {
        getTodaysProblem(
          configManager,
          router,
          problemBank,
          problemGenerator,
          problemMutator,
          sidebarProvider,
          sessionManager,
          repository,
          workspaceManager,
          context.extensionUri,
        );
      });
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
      vscode.commands.executeCommand("codedrill.sidebar.focus");
      sidebarProvider.postMessage({ type: "openPanel", panel: "dashboard" });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.reloadPrompts", () => {
      clearTemplateCache();
      vscode.window.showInformationMessage("CodeDrill: Prompt template cache cleared.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedrill.downloadProblems", () => {
      repoReady.then(() => downloadAllProblems(problemBank));
    })
  );

  console.log("CodeDrill extension activated.");
}

/**
 * "Get Today's Problem" flow:
 *   1. Ensure config + router are ready
 *   2. Select a problem from ProblemBank (DB-backed)
 *   3. Check attempt count -- mutate if 3+
 *   4. Generate a full markdown problem statement via LLM
 *   5. Write to .codedrill/problems/YYYY-MM-DD/{slug}.md
 *   6. Open the file in the editor
 *   7. Create session + notify sidebar webview
 */
async function getTodaysProblem(
  configManager: ConfigManager,
  router: LLMRouter,
  problemBank: ProblemBank,
  problemGenerator: ProblemGeneratorPersona,
  problemMutator: ProblemMutator,
  sidebarProvider: SidebarProvider,
  sessionManager: SessionManager,
  repository: Repository,
  workspaceManager: WorkspaceManager,
  extensionUri: vscode.Uri,
): Promise<void> {
  sessionCancellation = new vscode.CancellationTokenSource();
  const externalToken = sessionCancellation.token;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CodeDrill: Generating your problem...",
      cancellable: true,
    },
    async (progress, token) => {
      // Merge the VS Code notification cancel with our external cancel
      const mergedAborted = () => token.isCancellationRequested || externalToken.isCancellationRequested;
      externalToken.onCancellationRequested(() => {
        // Force the progress notification to close by aborting
      });
      const sendProgress = (step: string, detail?: string, problemPreview?: object) => {
        sidebarProvider.postMessage({
          type: "sessionProgress",
          step,
          detail: detail ?? step,
          problemPreview,
        });
      };

      try {
        // 1. Load config and init router
        sendProgress("config", "Loading configuration...");
        progress.report({ message: "Loading configuration..." });
        const config = await configManager.loadConfig();
        await router.initialize(config.providers);

        if (!router.hasProviders) {
          sidebarProvider.postMessage({ type: "sessionError", message: "No AI providers configured." });
          vscode.window.showErrorMessage(
            "No AI providers configured. Run 'CodeDrill: Configure Providers' first.",
          );
          return;
        }

        const model = config.defaultModel
          ?? router.getAvailableModels()[0]?.id;
        if (!model) {
          sidebarProvider.postMessage({ type: "sessionError", message: "No models available." });
          vscode.window.showErrorMessage(
            "No models available. Make sure your AI provider is running.",
          );
          return;
        }

        const prefs = config.preferences ?? {};
        const language = typeof prefs.preferredLanguage === "string"
          ? prefs.preferredLanguage
          : "python";

        // 2. Select a problem from DB-backed ProblemBank
        sendProgress("selecting", "Selecting a problem...");
        progress.report({ message: "Selecting a problem..." });

        if (repository.getProblemCount() === 0) {
          sidebarProvider.postMessage({ type: "sessionError", message: "No problems loaded." });
          vscode.window.showErrorMessage(
            "No problems loaded. Make sure the repository initialized successfully.",
          );
          return;
        }

        const problem = await problemBank.getNewProblem();
        if (!problem) {
          sidebarProvider.postMessage({ type: "sessionError", message: "Could not select a problem." });
          vscode.window.showErrorMessage("Could not select a problem. All problems may have been attempted.");
          return;
        }

        if (mergedAborted()) {
          sidebarProvider.postMessage({ type: "sessionError", message: "Cancelled." });
          return;
        }

        // Send problem preview to sidebar immediately
        const timerMins = problem.difficulty === "Easy"
          ? (typeof prefs.timerEasy === "number" ? prefs.timerEasy : 20)
          : problem.difficulty === "Medium"
            ? (typeof prefs.timerMedium === "number" ? prefs.timerMedium : 35)
            : (typeof prefs.timerHard === "number" ? prefs.timerHard : 50);

        sendProgress("generating", `Generating "${problem.title}"...`, {
          title: problem.title,
          difficulty: problem.difficulty,
          category: problem.category,
          timerMins,
        });

        // 3. Use REAL LeetCode data (not LLM-generated)
        //
        // ProblemBank.getNewProblem() already fetches the real description
        // from LeetCode if it's missing. The LLM should NEVER be used to
        // make up problem statements -- it hallucinates examples and answers.
        //
        // The LLM is only used for:
        //   a) Problem mutations (attempt 3+) -- changing constraints etc.
        //   b) Fallback when LeetCode fetch fails AND no description exists.

        const attemptCount = repository.getAttemptCount(problem.id);
        const isMutation = problemMutator.shouldMutate(attemptCount);
        let markdown: string | null = null;
        let mutationStrategy: string | null = null;

        if (isMutation) {
          sendProgress("generating", `Generating mutation for "${problem.title}"...`, {
            title: problem.title,
            difficulty: problem.difficulty,
            category: problem.category,
            timerMins,
          });
          progress.report({ message: `Generating mutation for "${problem.title}"...` });

          const abortController = new AbortController();
          token.onCancellationRequested(() => abortController.abort());
          externalToken.onCancellationRequested(() => abortController.abort());

          const streamChunkToSidebar = (chunk: string) => {
            sidebarProvider.postMessage({ type: "sessionGenerationChunk", content: chunk });
          };

          const attempts = repository.getAttemptsForProblem(problem.id);
          const mutationResult = await problemMutator.generateMutation(
            problem,
            attempts,
            router,
            model,
            abortController.signal,
            streamChunkToSidebar,
          );

          if (mutationResult) {
            markdown = mutationResult.markdown;
            mutationStrategy = mutationResult.strategy;
          }
        }

        // For non-mutations: use the real LeetCode description
        if (!markdown && !isMutation) {
          if (problem.description) {
            // Real LeetCode data -- use it directly
            markdown = formatProblemMarkdown(problem);
            // Stream the real content to sidebar for preview
            sidebarProvider.postMessage({
              type: "sessionGenerationChunk",
              content: markdown,
            });
          } else {
            // No description available (LeetCode fetch failed).
            // Fall back to LLM generation as last resort.
            sendProgress("generating", `Generating "${problem.title}" (LeetCode unavailable, using AI)...`, {
              title: problem.title,
              difficulty: problem.difficulty,
              category: problem.category,
              timerMins,
            });
            progress.report({ message: `Generating "${problem.title}" via AI...` });

            const streamChunkToSidebar = (chunk: string) => {
              sidebarProvider.postMessage({ type: "sessionGenerationChunk", content: chunk });
            };

            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());
            externalToken.onCancellationRequested(() => abortController.abort());

            markdown = await problemGenerator.generateProblem(
              problem,
              language,
              router,
              model,
              abortController.signal,
              streamChunkToSidebar,
            );
          }
        }

        if (mergedAborted()) {
          sidebarProvider.postMessage({ type: "sessionError", message: "Cancelled." });
          return;
        }

        if (!markdown) {
          sidebarProvider.postMessage({ type: "sessionError", message: "Failed to load the problem." });
          vscode.window.showErrorMessage(
            "Failed to load the problem. Check your internet connection for LeetCode access.",
          );
          return;
        }

        // 5. Write to .codedrill/problems/YYYY-MM-DD/{slug}.md
        sendProgress("saving", "Saving problem file...");
        progress.report({ message: "Saving problem file..." });

        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceUri) {
          sidebarProvider.postMessage({ type: "sessionError", message: "No workspace folder open." });
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

        const slug = problem.slug;
        const suffix = isMutation ? `-mutation-${attemptCount}` : "";
        const fileUri = vscode.Uri.joinPath(problemDir, `${slug}${suffix}.md`);
        await vscode.workspace.fs.writeFile(
          fileUri,
          new TextEncoder().encode(markdown),
        );

        // 6. Scaffold workspace (git repo + {slug}.py + test file)
        sendProgress("session", "Setting up workspace...");
        progress.report({ message: "Setting up workspace..." });
        try {
          const practiceDir = await workspaceManager.ensureWorkspace();
          if (practiceDir) {
            const { code: stubCode, functionName: fnName } = WorkspaceManager.buildCodeStub(
              slug, problem.codeStub,
            );

            // Generate LLM-powered test cases (20+)
            sendProgress("session", "Generating test cases...");
            progress.report({ message: "Generating test cases..." });
            const input = extractTestGenInput(markdown, stubCode);
            const llmCases = await generateTestCases(
              extensionUri, router, model, input,
            );

            const testCode = workspaceManager.buildTestFile(
              slug,
              fnName,
              "Solution",
              problem.examples.map((ex) => ({ input: ex.input, output: ex.output })),
              llmCases,
            );
            const { solutionUri } = await workspaceManager.scaffoldProblem(slug, markdown, stubCode, testCode);
            await workspaceManager.commitProblem(slug);

            vscode.window.showInformationMessage(
              `CodeDrill: Scaffolded ${slug} with ${problem.examples.length + llmCases.length} test cases`,
            );

            const solDoc = await vscode.workspace.openTextDocument(solutionUri);
            await vscode.window.showTextDocument(solDoc, {
              viewColumn: vscode.ViewColumn.One,
              preview: false,
            });
          }
        } catch (wsErr) {
          console.warn("[CodeDrill] Workspace scaffolding failed (non-fatal):", wsErr);
        }

        // 7. Create session
        sendProgress("session", "Setting up session...");
        progress.report({ message: "Setting up session..." });
        const session = await sessionManager.startSession(problem.id);

        // 8. Open problem markdown in editor (column 2, alongside the solution file)
        try {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Two,
            preview: true,
          });
        } catch { /* non-fatal -- solution file is already open */ }

        // 9. Notify sidebar and store active problem + start timer
        const problemMeta = {
          slug: problem.slug,
          title: isMutation ? `[MUTATION] ${problem.title}` : problem.title,
          difficulty: problem.difficulty,
          category: problem.category,
          filePath: fileUri.fsPath,
          problemId: problem.id,
          sessionId: session?.id,
          timerDurationMs: timerMins * 60 * 1000,
          isMutation,
          mutationStrategy: mutationStrategy ?? undefined,
        };
        sidebarProvider.setActiveProblem(problemMeta);
        sidebarProvider.postMessage({
          type: "problemLoaded",
          problem: problemMeta,
        });

        vscode.window.showInformationMessage(
          `CodeDrill: "${problem.title}" is ready!${isMutation ? " (Mutated)" : ""} Timer: ${timerMins} min. Good luck!`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[CodeDrill] getTodaysProblem error:", msg);
        sidebarProvider.postMessage({ type: "sessionError", message: msg });
        vscode.window.showErrorMessage(`CodeDrill: ${msg}`);
      }
    },
  );
}

/**
 * Format a Problem from the database into a clean Markdown practice file.
 * Uses REAL LeetCode data -- no LLM hallucination.
 */
export function formatProblemMarkdown(problem: import("./db/schema").Problem): string {
  const lines: string[] = [];

  lines.push(`# ${problem.title}`);
  lines.push("");
  lines.push(`**Difficulty**: ${problem.difficulty}`);
  lines.push(`**Category**: ${problem.category}`);
  if (problem.tags.length > 0) {
    lines.push(`**Tags**: ${problem.tags.join(", ")}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // The description is the real LeetCode problem text (already Markdown)
  lines.push(problem.description);
  lines.push("");

  // Examples (if stored separately from description)
  if (problem.examples.length > 0) {
    lines.push("## Examples");
    lines.push("");
    for (let i = 0; i < problem.examples.length; i++) {
      const ex = problem.examples[i];
      lines.push(`### Example ${i + 1}`);
      lines.push(`**Input**: ${ex.input}`);
      lines.push(`**Output**: ${ex.output}`);
      if (ex.explanation) {
        lines.push(`**Explanation**: ${ex.explanation}`);
      }
      lines.push("");
    }
  }

  // Constraints
  if (problem.constraints) {
    lines.push("## Constraints");
    lines.push("");
    lines.push(problem.constraints);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("> Write your solution below. Start the timer when you're ready.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Batch-download all missing problem descriptions from LeetCode.
 * Shows a cancellable progress notification.
 */
async function downloadAllProblems(problemBank: ProblemBank): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CodeDrill: Downloading problem descriptions...",
      cancellable: true,
    },
    async (progress, token) => {
      const cancellation = { isCancellationRequested: false };
      token.onCancellationRequested(() => { cancellation.isCancellationRequested = true; });

      const downloaded = await problemBank.downloadAllDescriptions(
        (done, total, current) => {
          const pct = Math.round((done / total) * 100);
          progress.report({
            message: `${done}/${total} (${pct}%) - ${current}`,
            increment: (1 / total) * 100,
          });
        },
        cancellation,
      );

      if (cancellation.isCancellationRequested) {
        vscode.window.showInformationMessage(`CodeDrill: Download cancelled. ${downloaded} problems saved.`);
      } else {
        vscode.window.showInformationMessage(`CodeDrill: Downloaded ${downloaded} problem descriptions.`);
      }
    },
  );
}

/**
 * Called when the extension is deactivated.
 */
export async function deactivate(): Promise<void> {
  prefetchPipeline?.stop();
  prefetchPipeline = null;

  cancelSessionGeneration();

  if (sidebarRef) {
    sidebarRef.dispose();
    sidebarRef = null;
  }

  if (repositoryRef) {
    try { await repositoryRef.close(); } catch { /* best-effort */ }
    repositoryRef = null;
  }

  console.log("CodeDrill extension deactivated.");
}
