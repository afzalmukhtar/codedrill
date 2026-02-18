import * as vscode from "vscode";
import type { ConfigManager } from "../utils/config";
import type { LLMRouter } from "../ai/llm-router";
import type { ChatMessage } from "../ai/providers/types";
import type { PromptContext } from "../ai/personas/prompt-loader";
import { PersonaRouter, type SessionState } from "../ai/personas/persona-router";
import { ChatStorage, type ChatSession } from "../storage/chat-storage";
import { ProfileManager } from "../storage/profile-manager";
import { ContextEngine } from "../context/context-engine";
import { Timer } from "../core/timer";
import type { Repository } from "../db/repository";
import type { ProblemBank } from "../core/problem-bank";
import type { ProblemGeneratorPersona } from "../ai/personas/problem-generator";
import type { SessionManager } from "../core/session-manager";

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
  private _mode: string = "interview";
  private _conversationHistory: ChatMessage[] = [];
  private _activeChatId: string | null = null;
  private _chatCreatedAt: number | null = null;
  private _chatStorage: ChatStorage;

  // AbortController for the current streaming request
  private _abortController: AbortController | null = null;

  private readonly _contextEngine: ContextEngine;
  private readonly _personaRouter: PersonaRouter;
  private readonly _profileManager: ProfileManager;

  /** Cached last active text editor so context survives webview focus. */
  private _lastActiveEditor: vscode.TextEditor | undefined;

  /** Active problem metadata (set after "Get Today's Problem" completes). */
  private _activeProblem: {
    slug: string;
    title: string;
    difficulty: string;
    category: string;
    filePath: string;
    problemId?: number;
    sessionId?: number;
    timerDurationMs?: number;
    isMutation?: boolean;
    mutationStrategy?: string;
  } | null = null;

  /** Whether the user gave up on the current problem (switches to teacher). */
  private _gaveUp = false;

  /** Student's self-assessment after giving up / finishing (e.g. "Again", "Hard"). */
  private _studentAssessment: string | null = null;

  /** How long the student spent before giving up or finishing. */
  private _sessionTimeSpent: string | null = null;

  /** The user's manually selected mode before a session overrode it. */
  private _preSessionMode: string = "interview";

  /** Countdown timer (lives in extension host, survives webview recreation). */
  private readonly _timer = new Timer();

  /** Heartbeat: checks for inactivity and sends auto-nudges during interview mode. */
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _lastUserMessageTime = 0;
  private _lastNudgePhase = 0;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _configManager: ConfigManager,
    private readonly _router: LLMRouter,
    subscriptions: vscode.Disposable[],
    private readonly _problemBank?: ProblemBank,
    private readonly _problemGenerator?: ProblemGeneratorPersona,
    private readonly _sessionManager?: SessionManager,
    private readonly _repository?: Repository,
  ) {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    this._chatStorage = new ChatStorage(workspaceUri);
    this._contextEngine = new ContextEngine();
    this._personaRouter = new PersonaRouter(this._extensionUri);
    this._profileManager = new ProfileManager(workspaceUri, this._extensionUri);

    // Seed with the currently active editor (if any).
    this._lastActiveEditor = vscode.window.activeTextEditor;

    // Track editor focus changes so we remember the last real editor
    // even after the webview steals focus.
    subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this._lastActiveEditor = editor;
        }
      }),
    );

    // Timer events → webview messages
    subscriptions.push(
      this._timer.onTick((remainingMs, phase) => {
        this.postMessage({
          type: "timerUpdate",
          remainingMs,
          totalMs: this._timer.durationMs,
          phase,
          isRunning: this._timer.isRunning,
          isPaused: this._timer.isPaused,
        });
      }),
    );

    subscriptions.push(
      this._timer.onExpired(() => {
        this._stopHeartbeat();
        this._mode = "teach";
        this.postMessage({ type: "modeOverride", mode: "teach" });
        this.postMessage({ type: "timerExpired" });
      }),
    );
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

      case "setMode": {
        const incoming = (message.mode as string) || "interview";
        this._mode = (incoming === "teach" || incoming === "interview") ? incoming : "interview";
        break;
      }

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

      case "startSession":
        await this._onStartSession();
        break;

      case "timerAction":
        this._onTimerAction(message.action as string, message.durationMs as number | undefined);
        break;

      case "rateAttempt":
        await this._onRateAttempt(message.rating as 1 | 2 | 3 | 4, message.gaveUp as boolean | undefined);
        break;

      case "configureProviders":
        await this._onConfigureProviders();
        break;

      case "listProblems":
        this._onListProblems(message.category as string | undefined);
        break;

      case "getCategories":
        this._onGetCategories();
        break;

      case "openProblem":
        await this._onOpenProblem(message.slug as string);
        break;

      case "viewProblem":
        this._onViewProblem();
        break;

      case "giveUp":
        this._onGiveUp();
        break;

      case "getDashboard":
        this._onGetDashboard();
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

    // Resend active problem + timer state so the webview can restore context
    // after being destroyed and recreated (e.g. user switched sidebar tabs).
    if (this._activeProblem) {
      this.postMessage({
        type: "problemLoaded",
        problem: this._activeProblem,
      });
    }

    if (this._timer.isRunning) {
      this.postMessage({
        type: "timerUpdate",
        remainingMs: this._timer.getRemainingMs(),
        totalMs: this._timer.durationMs,
        phase: this._timer.getPhase(),
        isRunning: true,
        isPaused: this._timer.isPaused,
      });
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
      this.postMessage({ type: "chatInterrupted" });
    }
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
    this._lastUserMessageTime = Date.now();

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

    // Gather IDE context (active file, selection, cursor surroundings).
    // Pass the cached editor so context is preserved even when webview has focus.
    const contextAttachments = this._contextEngine.gatherAutoContext(this._lastActiveEditor);
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
        signal: abortController.signal,
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

      // Track hint usage: when the user asks the interviewer a question during an active session
      if (this._mode === "interview" && this._sessionManager?.hasActiveSession) {
        this._sessionManager.recordHint();
      }

      // Auto-save after each exchange
      await this._autoSaveChat();

      // Trigger profile update in the background every N messages
      if (this._profileManager.shouldUpdateProfile(this._conversationHistory.length)) {
        this._triggerProfileUpdate();
      }
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

  private async _onNewChat(): Promise<void> {
    await this._autoSaveChat();
    this._conversationHistory = [];
    this._activeChatId = null;
    this._chatCreatedAt = null;
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
    this._chatCreatedAt = session.createdAt;
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
      this._chatCreatedAt = now;
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
      createdAt: this._chatCreatedAt ?? now,
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
  // Profile update (background, fire-and-forget)
  // ================================================================

  private _triggerProfileUpdate(): void {
    const recent = this._conversationHistory.slice(-20);
    this._profileManager
      .loadProfile()
      .then((existing) =>
        this._profileManager.generateProfile(
          recent,
          existing,
          this._router,
          this._selectedModel,
        ),
      )
      .then((profile) => {
        if (profile) {
          return this._profileManager.saveProfile(profile);
        }
      })
      .catch((err) => {
        console.error("[SidebarProvider] Background profile update failed:", err);
      });
  }

  // ================================================================
  // System prompts per mode
  // ================================================================

  private async _getSystemPrompt(contextAttachments: ReturnType<ContextEngine["gatherAutoContext"]>): Promise<string> {
    const context = await this._buildPromptContext(contextAttachments);

    const sessionState: SessionState = {
      isActive: this._sessionManager?.hasActiveSession ?? false,
      timerRunning: this._timer.isRunning,
      gaveUp: this._gaveUp,
    };

    return this._personaRouter.getPromptForMode(this._mode, context, sessionState);
  }

  private async _buildPromptContext(
    contextAttachments: ReturnType<ContextEngine["gatherAutoContext"]>,
  ): Promise<PromptContext> {
    const fileAttachment = contextAttachments.find((a) => a.type === "file");
    const selectionAttachment = contextAttachments.find((a) => a.type === "selection");

    const userProfile = await this._profileManager.loadProfile();

    // If an active problem file is loaded, read its content for prompt context.
    let problemStatement: string | undefined;
    if (this._activeProblem?.filePath) {
      try {
        const problemUri = vscode.Uri.file(this._activeProblem.filePath);
        const bytes = await vscode.workspace.fs.readFile(problemUri);
        problemStatement = new TextDecoder("utf-8").decode(bytes);
      } catch (err) {
        console.warn("[SidebarProvider] Could not read problem file:", err);
      }
    }

    // Session state for persona prompts
    let attemptNumber: number | undefined;
    let hintLevel: number | undefined;
    let timeRemaining: string | undefined;
    let previousRatings: string | undefined;

    const session = this._sessionManager?.getCurrentSession();
    if (session && this._activeProblem?.problemId) {
      const problemId = this._activeProblem.problemId;
      hintLevel = session.hintsUsed;

      if (this._repository) {
        attemptNumber = this._repository.getAttemptCount(problemId) + 1;

        const attempts = this._repository.getAttemptsForProblem(problemId);
        if (attempts.length > 0) {
          const ratingLabels: Record<number, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
          previousRatings = attempts
            .filter((a) => a.rating !== null)
            .map((a) => ratingLabels[a.rating!] ?? String(a.rating))
            .join(", ");
        }
      }

      if (this._timer.isRunning) {
        const ms = this._timer.getRemainingMs();
        const totalSec = Math.max(0, Math.ceil(ms / 1000));
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        timeRemaining = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      }
    }

    let timeElapsed: string | undefined;
    if (this._timer.isRunning) {
      const elapsedMs = this._timer.getElapsedMs();
      const elapsedMin = Math.floor(elapsedMs / 60_000);
      const elapsedSec = Math.floor((elapsedMs % 60_000) / 1000);
      timeElapsed = `${String(elapsedMin).padStart(2, "0")}:${String(elapsedSec).padStart(2, "0")}`;
    }

    // Capture the user's code from the active editor for teacher context
    let userCode: string | undefined;
    const editor = this._lastActiveEditor ?? vscode.window.activeTextEditor;
    if (editor && this._gaveUp) {
      userCode = editor.document.getText();
    }

    return {
      userProfile: userProfile || undefined,
      filePath: fileAttachment?.metadata?.filePath,
      language: fileAttachment?.metadata?.language,
      fileContent: fileAttachment?.content,
      selection: selectionAttachment?.content,
      problemStatement,
      attemptNumber,
      hintLevel,
      timeRemaining,
      timeElapsed,
      previousRatings: previousRatings || undefined,
      studentAssessment: this._studentAssessment || undefined,
      userCode,
      timeSpent: this._sessionTimeSpent || undefined,
      gaveUp: this._gaveUp ? "true" : undefined,
    };
  }

  // ================================================================
  // startSession -- trigger "Get Today's Problem" from webview
  // ================================================================

  private async _onStartSession(): Promise<void> {
    await vscode.commands.executeCommand("codedrill.startSession");
  }

  /**
   * Called externally (from extension.ts) when a problem is loaded.
   * Stores the active problem reference and starts the timer.
   */
  public async setActiveProblem(problem: {
    slug: string;
    title: string;
    difficulty: string;
    category: string;
    filePath: string;
    problemId?: number;
    sessionId?: number;
    timerDurationMs?: number;
    isMutation?: boolean;
    mutationStrategy?: string;
  }): Promise<void> {
    this._activeProblem = problem;
    this._gaveUp = false;

    if (this._sessionManager) {
      await this._sessionManager.beginAttempt("new");
    }

    // Do NOT auto-start timer. Send the duration to the webview so the
    // user can start it when they're ready.
  }

  // ================================================================
  // Timer actions from webview
  // ================================================================

  private _onTimerAction(action: string, durationMs?: number): void {
    switch (action) {
      case "start":
        if (durationMs && durationMs > 0) {
          this._preSessionMode = this._mode;
          this._mode = "interview";
          this.postMessage({ type: "modeOverride", mode: "interview" });
          this._timer.start(durationMs);
          this._startHeartbeat();
        }
        break;
      case "pause":
        this._timer.pause();
        break;
      case "resume":
        this._timer.resume();
        break;
      case "stop": {
        this._stopHeartbeat();
        const result = this._timer.stop();
        this.postMessage({
          type: "timerStopped",
          elapsedMs: result.elapsedMs,
          wasExpired: result.wasExpired,
        });
        break;
      }
      case "reset": {
        this._stopHeartbeat();
        this._timer.reset();
        this.postMessage({ type: "timerStopped", elapsedMs: 0, wasExpired: false });
        break;
      }
    }
  }

  // ================================================================
  // Give up -- immediately switch to teacher mode
  // ================================================================

  private _onGiveUp(): void {
    this._gaveUp = true;
    this._stopHeartbeat();

    if (this._timer.isRunning) {
      const result = this._timer.stop();
      const min = Math.floor(result.elapsedMs / 60_000);
      const sec = Math.floor((result.elapsedMs % 60_000) / 1000);
      this._sessionTimeSpent = `${min}m ${sec}s`;
      this.postMessage({
        type: "timerStopped",
        elapsedMs: result.elapsedMs,
        wasExpired: result.wasExpired,
      });
    }

    this._mode = "teach";
    this.postMessage({ type: "modeOverride", mode: "teach" });
  }

  // ================================================================
  // Heartbeat -- auto-nudge during interview mode
  // ================================================================

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._lastUserMessageTime = Date.now();
    this._lastNudgePhase = 0;

    this._heartbeatInterval = setInterval(() => {
      this._heartbeatTick();
    }, 60_000);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatInterval !== null) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    this._lastNudgePhase = 0;
  }

  private _heartbeatTick(): void {
    if (!this._timer.isRunning || this._timer.isPaused) { return; }
    if (this._mode !== "interview") { return; }

    const elapsedMs = this._timer.getElapsedMs();
    const elapsedMin = elapsedMs / 60_000;
    const silenceSec = (Date.now() - this._lastUserMessageTime) / 1000;

    // Only nudge if user has been silent for at least 90 seconds
    if (silenceSec < 90) { return; }

    // Determine which phase we're in and whether we've already nudged at this level
    let phase = 0;
    if (elapsedMin >= 19) { phase = 3; }
    else if (elapsedMin >= 13) { phase = 2; }
    else if (elapsedMin >= 8) { phase = 1; }

    if (phase === 0 || phase <= this._lastNudgePhase) { return; }
    this._lastNudgePhase = phase;

    this._sendHeartbeatNudge(elapsedMin).catch((err) => {
      console.error("[SidebarProvider] Heartbeat nudge failed:", err);
    });
  }

  private async _sendHeartbeatNudge(elapsedMin: number): Promise<void> {
    if (!this._router.hasProviders || !this._selectedModel) { return; }

    const heartbeatMessage = `[HEARTBEAT] The candidate has been quiet. Elapsed time: ${Math.floor(elapsedMin)} minutes. Check their code and respond according to the heartbeat protocol.`;

    this._conversationHistory.push({ role: "user", content: heartbeatMessage });

    const abortController = new AbortController();
    this._abortController = abortController;

    const contextAttachments = this._contextEngine.gatherAutoContext(this._lastActiveEditor);
    const systemPrompt = await this._getSystemPrompt(contextAttachments);

    try {
      const stream = this._router.chat({
        model: this._selectedModel,
        messages: this._conversationHistory,
        systemPrompt,
        stream: true,
        temperature: 0.7,
        signal: abortController.signal,
      });

      let fullContent = "";

      for await (const chunk of stream) {
        if (abortController.signal.aborted) { break; }
        if (chunk.type === "content" && chunk.content) {
          fullContent += chunk.content;
        }
      }

      // Remove the synthetic heartbeat user message
      this._conversationHistory.pop();

      // If the LLM responded with [SILENCE], don't show anything
      if (!fullContent || fullContent.trim() === "[SILENCE]") { return; }

      this._conversationHistory.push({ role: "assistant", content: fullContent });

      this.postMessage({ type: "chatChunk", content: fullContent });
      this.postMessage({ type: "chatDone" });
    } catch (err) {
      // Remove the synthetic message on error
      if (this._conversationHistory.length > 0 && this._conversationHistory[this._conversationHistory.length - 1].content.startsWith("[HEARTBEAT]")) {
        this._conversationHistory.pop();
      }
      console.error("[SidebarProvider] Heartbeat error:", err);
    } finally {
      if (this._abortController === abortController) {
        this._abortController = null;
      }
    }
  }

  // ================================================================
  // Rating -- record attempt + FSRS update
  // ================================================================

  private async _onRateAttempt(rating: 1 | 2 | 3 | 4, gaveUp?: boolean): Promise<void> {
    if (!this._sessionManager) {
      this.postMessage({ type: "chatError", message: "Session manager not available." });
      return;
    }

    if (gaveUp) {
      this._gaveUp = true;
    }

    this._stopHeartbeat();

    const ratingLabels: Record<number, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
    this._studentAssessment = ratingLabels[rating] ?? String(rating);

    // Stop timer and collect elapsed time
    const timerResult = this._timer.isRunning
      ? this._timer.stop()
      : { elapsedMs: 0, wasExpired: false };

    if (!this._sessionTimeSpent && timerResult.elapsedMs > 0) {
      const min = Math.floor(timerResult.elapsedMs / 60_000);
      const sec = Math.floor((timerResult.elapsedMs % 60_000) / 1000);
      this._sessionTimeSpent = `${min}m ${sec}s`;
    }

    try {
      const updatedCard = await this._sessionManager.completeAttempt(
        rating,
        timerResult.elapsedMs,
        this._activeProblem?.timerDurationMs ?? 0,
        undefined,
        gaveUp ?? false,
        this._activeProblem?.isMutation ?? false,
        this._activeProblem?.mutationStrategy ?? null,
      );

      const nextReview = updatedCard?.due
        ? new Date(updatedCard.due).toLocaleDateString()
        : "unknown";

      this.postMessage({
        type: "ratingRecorded",
        rating,
        nextReview,
        cardState: updatedCard?.state ?? "New",
      });

      await this._sessionManager.endSession();

      // If the student gave up or found it hard, auto-trigger the teacher
      if (gaveUp || rating <= 2) {
        this._mode = "teach";
        this.postMessage({ type: "modeOverride", mode: "teach" });
        this._autoStartTeacher();
      } else {
        this._activeProblem = null;
        this._gaveUp = false;
        this._studentAssessment = null;
        this._sessionTimeSpent = null;
        this._mode = this._preSessionMode;
        this.postMessage({ type: "modeOverride", mode: this._preSessionMode });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SidebarProvider] Rating error:", msg);
      this.postMessage({ type: "chatError", message: `Failed to record rating: ${msg}` });
    }
  }

  /**
   * Auto-trigger teacher after give-up / hard rating.
   * Sends a synthetic user message that primes the teacher with full context.
   */
  private _autoStartTeacher(): void {
    const parts: string[] = [];
    if (this._activeProblem) {
      parts.push(`I just ${this._gaveUp ? "gave up on" : "finished"} "${this._activeProblem.title}" (${this._activeProblem.difficulty}).`);
    }
    if (this._studentAssessment) {
      parts.push(`I rated it as: ${this._studentAssessment}.`);
    }
    if (this._sessionTimeSpent) {
      parts.push(`I spent ${this._sessionTimeSpent} on it.`);
    }
    parts.push("Please teach me this problem step by step — start by explaining the problem, then the fundamentals, and then review my code.");

    const teacherKickoff = parts.join(" ");
    this._onSendMessage(teacherKickoff);
  }

  // ================================================================
  // Problem browser
  // ================================================================

  private _onListProblems(category?: string): void {
    if (!this._repository) { return; }

    const problems = this._repository.listProblems(category);
    this.postMessage({
      type: "problemList",
      problems: problems.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        category: p.category,
        pattern: p.pattern ?? null,
        hasDescription: !!p.description,
        attemptCount: this._repository!.getAttemptCount(p.id),
      })),
    });
  }

  private _onGetCategories(): void {
    if (!this._repository) { return; }

    const categories = this._repository.getCategories();
    this.postMessage({ type: "categoryList", categories });
  }

  private async _onOpenProblem(slug: string): Promise<void> {
    if (!this._problemBank) { return; }

    const problem = await this._problemBank.getProblemBySlug(slug);
    if (!problem) {
      this.postMessage({ type: "chatError", message: `Problem "${slug}" not found.` });
      return;
    }

    // If there's a description, write it to a file and open it
    if (problem.description) {
      const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceUri) { return; }

      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");

      const dir = vscode.Uri.joinPath(workspaceUri, ".codedrill", "problems", dateStr);
      try { await vscode.workspace.fs.stat(dir); } catch { await vscode.workspace.fs.createDirectory(dir); }

      const fileUri = vscode.Uri.joinPath(dir, `${slug}.md`);
      await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(problem.description));

      const doc = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

      // Determine timer duration based on difficulty
      const config = this._configManager.config;
      const prefs = config.preferences ?? {};
      const timerMins = problem.difficulty === "Easy"
        ? (typeof prefs.timerEasy === "number" ? prefs.timerEasy : 20)
        : problem.difficulty === "Medium"
          ? (typeof prefs.timerMedium === "number" ? prefs.timerMedium : 35)
          : (typeof prefs.timerHard === "number" ? prefs.timerHard : 50);

      const problemMeta = {
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        category: problem.category,
        filePath: fileUri.fsPath,
        problemId: problem.id,
        timerDurationMs: timerMins * 60 * 1000,
      };
      this.setActiveProblem(problemMeta);
      this.postMessage({ type: "problemLoaded", problem: problemMeta });
    } else {
      this.postMessage({ type: "chatError", message: `No description available for "${slug}". Run "Start Session" to generate one via LLM.` });
    }
  }

  // ================================================================
  // Dashboard -- aggregate stats for the progress dashboard
  // ================================================================

  private _onGetDashboard(): void {
    if (!this._repository) {
      this.postMessage({
        type: "dashboardData",
        data: {
          totalSolved: 0,
          totalProblems: 0,
          streakDays: 0,
          dueCount: 0,
          categoryStats: [],
          patternStats: [],
          dueReviews: [],
        },
      });
      return;
    }

    const totalSolved = this._repository.getTotalSolved();
    const totalProblems = this._repository.getProblemCount();
    const streakDays = this._repository.getStreakDays();
    const categoryStats = this._repository.getCategoryStats();
    const patternStats = this._repository.getPatternStats();

    const dueCards = this._repository.getDueCards(10);
    const dueReviews = dueCards.map((card) => {
      const problem = this._repository!.getProblemById(card.problemId);
      return {
        title: problem?.title ?? `Problem #${card.problemId}`,
        difficulty: problem?.difficulty ?? "Medium",
        category: problem?.category ?? "",
        due: card.due,
      };
    });

    this.postMessage({
      type: "dashboardData",
      data: {
        totalSolved,
        totalProblems,
        streakDays,
        dueCount: dueCards.length,
        categoryStats,
        patternStats,
        dueReviews,
      },
    });
  }

  // ================================================================
  // View problem -- open the problem markdown in a split pane preview
  // ================================================================

  private _onViewProblem(): void {
    if (!this._activeProblem?.filePath) { return; }

    const fileUri = vscode.Uri.file(this._activeProblem.filePath);
    vscode.commands.executeCommand("markdown.showPreview", fileUri).then(
      undefined,
      () => {
        vscode.workspace.openTextDocument(fileUri).then((doc) => {
          vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true,
          });
        });
      },
    );
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
