import React, { createContext, useContext, useEffect, useState, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from "react";
import { Chat } from "./components/Chat";
import { ChatInput } from "./components/ChatInput";
import { Timer } from "./components/Timer";
import { RatingPanel } from "./components/RatingPanel";
import { SessionLoader, type SessionProgress } from "./components/SessionLoader";
import { ProblemBrowser } from "./components/ProblemBrowser";
import { Dashboard } from "./components/Dashboard";
import { ProfilePanel } from "./components/ProfilePanel";
import { IconNewChat, IconTrash, IconDownload, IconClose, IconEye, IconFlag, IconPlay, IconCode, IconReset } from "./components/Icons";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

interface ErrorBoundaryState { hasError: boolean; error?: Error }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[CodeDrill] Uncaught render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, textAlign: "center" }}>
          <p>Something went wrong.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{ marginTop: 8, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface VscodeContextType {
  postMessage: (message: unknown) => void;
}

const VscodeContext = createContext<VscodeContextType>({ postMessage: () => {} });

export function useVscode(): VscodeContextType {
  return useContext(VscodeContext);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  interrupted?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export type DrillMode = "teach" | "interview";

export interface ChatSummary {
  id: string;
  title: string;
  mode: string;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface ContextBadge {
  type: string;
  label: string;
  tokenEstimate: number;
}

const MODE_LABELS: Record<DrillMode, string> = {
  teach: "Teach",
  interview: "Interview",
};

/** Shape of the persisted webview state. */
interface PersistedState {
  messages: ChatMessage[];
  selectedModel: string;
  mode: DrillMode;
  activeChatId: string | null;
  activeProblem: {
    title: string;
    difficulty: string;
    category: string;
    timerDurationMs?: number;
    isMutation?: boolean;
  } | null;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = vscodeApi.getState() as PersistedState | null;
    if (raw && Array.isArray(raw.messages)) {
      return raw;
    }
  } catch { /* ignore */ }
  return null;
}

function AppContent() {
  const persisted = useRef(loadPersistedState());

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => persisted.current?.messages ?? []
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => persisted.current?.selectedModel ?? ""
  );
  const [mode, setMode] = useState<DrillMode>(
    () => {
      const saved = persisted.current?.mode;
      if (saved === "teach" || saved === "interview") return saved;
      return "interview";
    }
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(
    () => persisted.current?.activeChatId ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSummary[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [contextBadges, setContextBadges] = useState<ContextBadge[]>([]);
  const [showRating, setShowRating] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [ratingConfirmation, setRatingConfirmation] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [activeProblem, setActiveProblem] = useState<{
    title: string;
    difficulty: string;
    category: string;
    timerDurationMs?: number;
    isMutation?: boolean;
  } | null>(() => persisted.current?.activeProblem ?? null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionProgress, setSessionProgress] = useState<SessionProgress | null>(null);
  const [sessionStreamContent, setSessionStreamContent] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const streamBufferRef = useRef<string>("");
  const sessionStreamRef = useRef<string>("");
  const activeProblemRef = useRef(activeProblem);
  const sendCooldownRef = useRef(false);
  const historySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with state (for use in event handler closures)
  useEffect(() => { activeProblemRef.current = activeProblem; }, [activeProblem]);

  // Auto-dismiss export toast
  useEffect(() => {
    if (!exportToast) return;
    const t = setTimeout(() => setExportToast(null), 3000);
    return () => clearTimeout(t);
  }, [exportToast]);

  // Persist state whenever key values change
  useEffect(() => {
    const state: PersistedState = {
      messages: messages.map((m) => ({ ...m, isStreaming: false })),
      selectedModel,
      mode,
      activeChatId,
      activeProblem,
    };
    vscodeApi.setState(state);
  }, [messages, selectedModel, mode, activeChatId, activeProblem]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "chatChunk": {
          const chunk = message.content as string;
          streamBufferRef.current += chunk;
          const accumulated = streamBufferRef.current;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: accumulated },
              ];
            }
            return [
              ...prev,
              {
                role: "assistant" as const,
                content: accumulated,
                timestamp: Date.now(),
                isStreaming: true,
              },
            ];
          });
          break;
        }

        case "chatDone": {
          streamBufferRef.current = "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, isStreaming: false },
              ];
            }
            return prev;
          });
          setIsLoading(false);
          break;
        }

        case "chatError": {
          streamBufferRef.current = "";
          const errorMsg = message.message as string;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                {
                  role: "assistant" as const,
                  content: `Error: ${errorMsg}`,
                  timestamp: Date.now(),
                  isStreaming: false,
                },
              ];
            }
            return [
              ...prev,
              {
                role: "assistant" as const,
                content: `Error: ${errorMsg}`,
                timestamp: Date.now(),
                isStreaming: false,
              },
            ];
          });
          setIsLoading(false);
          break;
        }

        case "chatInterrupted": {
          streamBufferRef.current = "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, isStreaming: false, interrupted: true },
              ];
            }
            return prev;
          });
          setIsLoading(false);
          break;
        }

        case "modelsLoaded":
          setModels(message.models as ModelInfo[]);
          setModelsLoading(false);
          if (message.defaultModel) {
            setSelectedModel(message.defaultModel as string);
          }
          break;

        case "chatLoaded": {
          const loaded = message as {
            chatId: string;
            messages: ChatMessage[];
            mode: string;
          };
          setActiveChatId(loaded.chatId);
          setMessages(loaded.messages);
          if (loaded.mode === "teach" || loaded.mode === "interview") {
            setMode(loaded.mode);
          }
          setShowHistory(false);
          break;
        }

        case "chatCreated":
          setActiveChatId(message.chatId as string);
          break;

        case "chatHistoryList":
          setChatHistory(message.chats as ChatSummary[]);
          break;

        case "searchChatsResult":
          setChatHistory(message.chats as ChatSummary[]);
          break;

        case "exportChatResult": {
          const exportSuccess = (message as { success?: boolean }).success;
          if (exportSuccess) {
            setExportToast("Chat exported successfully");
          }
          break;
        }

        case "contextAttached":
          setContextBadges((message.badges as ContextBadge[]) ?? []);
          break;

        case "sessionProgress": {
          const sp = message as { step: string; detail: string; problemPreview?: SessionProgress["problemPreview"] };
          setSessionLoading(true);
          setSessionError(null);
          setSessionProgress({ step: sp.step, detail: sp.detail, problemPreview: sp.problemPreview });
          if (sp.step === "generating") {
            sessionStreamRef.current = "";
            setSessionStreamContent("");
          }
          break;
        }

        case "sessionGenerationChunk": {
          const chunk = message.content as string;
          sessionStreamRef.current += chunk;
          setSessionStreamContent(sessionStreamRef.current);
          break;
        }

        case "sessionError": {
          setSessionError(message.message as string);
          break;
        }

        case "problemLoaded": {
          const prob = message.problem as { title: string; difficulty: string; category: string; timerDurationMs?: number };
          setActiveProblem(prob);
          setShowRating(false);
          setRatingConfirmation(null);
          setSessionLoading(false);
          setSessionProgress(null);
          setSessionStreamContent("");
          setSessionError(null);
          sessionStreamRef.current = "";
          break;
        }

        case "timerExpired":
          setShowRating(true);
          break;

        case "timerStopped":
          if (activeProblemRef.current) {
            setShowRating(true);
          }
          break;

        case "modeOverride": {
          const incoming = message.mode as string;
          if (incoming === "teach" || incoming === "interview") {
            setMode(incoming);
          }
          break;
        }

        case "openPanel": {
          const panel = (message as { panel: string }).panel;
          setShowDashboard(panel === "dashboard");
          setShowProblems(panel === "problems");
          setShowHistory(panel === "history");
          break;
        }

        case "ratingRecorded": {
          const rc = message as { nextReview: string; cardState: string };
          setRatingConfirmation(`Next review: ${rc.nextReview}`);
          setShowRating(false);
          setGaveUp(false);
          setActiveProblem(null);
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    vscodeApi.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    if (sendCooldownRef.current) return;
    sendCooldownRef.current = true;
    setTimeout(() => { sendCooldownRef.current = false; }, 200);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text.trim(), timestamp: Date.now() },
    ]);
    streamBufferRef.current = "";
    setContextBadges([]);
    setIsLoading(true);
    vscodeApi.postMessage({ type: "sendMessage", text: text.trim() });
  }, []);

  const handleInterrupt = useCallback(() => {
    vscodeApi.postMessage({ type: "interrupt" });
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    vscodeApi.postMessage({ type: "selectModel", modelId });
  }, []);

  const handleConfigureModels = useCallback(() => {
    vscodeApi.postMessage({ type: "configureProviders" });
  }, []);

  const handleModeChange = useCallback((newMode: DrillMode) => {
    setMode(newMode);
    vscodeApi.postMessage({ type: "setMode", mode: newMode });
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveChatId(null);
    setIsLoading(false);
    streamBufferRef.current = "";
    vscodeApi.postMessage({ type: "newChat" });
    setShowHistory(false);
  }, []);

  const handleShowHistory = useCallback(() => {
    vscodeApi.postMessage({ type: "listChats" });
    setHistorySearch("");
    setShowHistory((prev) => !prev);
    setShowProblems(false);
    setShowDashboard(false);
    setShowProfile(false);
  }, []);

  const handleHistorySearch = useCallback((query: string) => {
    setHistorySearch(query);
    if (historySearchTimerRef.current) clearTimeout(historySearchTimerRef.current);
    historySearchTimerRef.current = setTimeout(() => {
      if (query.trim()) {
        vscodeApi.postMessage({ type: "searchChats", query });
      } else {
        vscodeApi.postMessage({ type: "listChats" });
      }
    }, 300);
  }, []);

  const handleExportChat = useCallback((chatId: string, format: "markdown" | "json") => {
    vscodeApi.postMessage({ type: "exportChat", chatId, format });
  }, []);

  const handleLoadChat = useCallback((chatId: string) => {
    vscodeApi.postMessage({ type: "loadChat", chatId });
  }, []);

  const handleDeleteChat = useCallback((chatId: string) => {
    const ok = window.confirm("Delete this chat? This cannot be undone.");
    if (!ok) return;
    vscodeApi.postMessage({ type: "deleteChat", chatId });
    setChatHistory((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      handleNewChat();
    }
  }, [activeChatId, handleNewChat]);

  const handleStartSession = useCallback(() => {
    setSessionLoading(true);
    setSessionError(null);
    setSessionProgress(null);
    setSessionStreamContent("");
    sessionStreamRef.current = "";
    vscodeApi.postMessage({ type: "startSession" });
  }, []);

  const handleCancelSession = useCallback(() => {
    vscodeApi.postMessage({ type: "cancelSession" });
    setSessionLoading(false);
    setSessionProgress(null);
    setSessionStreamContent("");
    setSessionError(null);
    sessionStreamRef.current = "";
  }, []);

  const handleRegenerate = useCallback(() => {
    setMessages((prev) => {
      const lastUserIdx = prev.map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx < 0) return prev;
      const lastUserMsg = prev[lastUserIdx].content;
      const withoutLastAssistant = prev.slice(0, -1).filter((_, i) => {
        if (i > lastUserIdx && prev[i].role === "assistant") return false;
        return true;
      });
      streamBufferRef.current = "";
      setIsLoading(true);
      vscodeApi.postMessage({ type: "sendMessage", text: lastUserMsg });
      return withoutLastAssistant;
    });
  }, []);

  const handleGiveUp = useCallback(() => {
    setGaveUp(true);
    setShowRating(true);
    vscodeApi.postMessage({ type: "giveUp" });
  }, []);

  return (
    <VscodeContext.Provider value={{ postMessage: vscodeApi.postMessage }}>
      <div className="sidebar-container">
        <header className="sidebar-header">
          <span className="sidebar-title">CODEDRILL</span>
          <button
            type="button"
            className="sidebar-action"
            title="New chat"
            aria-label="New chat"
            onClick={handleNewChat}
          >
            <IconNewChat size={16} />
          </button>
        </header>

        <nav className="sidebar-toolbar">
          <button
            type="button"
            className="toolbar-btn toolbar-btn--primary"
            onClick={handleStartSession}
            disabled={sessionLoading}
            aria-label="Start practice session"
          >
            Practice
          </button>
          <button
            type="button"
            className={`toolbar-btn${showProblems ? " toolbar-btn--active" : ""}`}
            onClick={() => { setShowProblems((p) => !p); setShowHistory(false); setShowDashboard(false); setShowProfile(false); }}
            aria-label="Browse problems"
          >
            Problems
          </button>
          <button
            type="button"
            className={`toolbar-btn${showHistory ? " toolbar-btn--active" : ""}`}
            onClick={handleShowHistory}
            aria-label="Chat history"
          >
            History
          </button>
          <button
            type="button"
            className={`toolbar-btn${showDashboard ? " toolbar-btn--active" : ""}`}
            onClick={() => { setShowDashboard((p) => !p); setShowHistory(false); setShowProblems(false); setShowProfile(false); }}
            aria-label="Dashboard statistics"
          >
            Stats
          </button>
          <button
            type="button"
            className={`toolbar-btn${showProfile ? " toolbar-btn--active" : ""}`}
            onClick={() => { setShowProfile((p) => !p); setShowHistory(false); setShowProblems(false); setShowDashboard(false); }}
            aria-label="User profile"
          >
            Profile
          </button>
        </nav>

        <Timer timerDurationMs={activeProblem?.timerDurationMs} mode={mode} />

        {showRating && (
          <RatingPanel
            onRated={() => { setShowRating(false); setGaveUp(false); }}
            gaveUp={gaveUp}
          />
        )}

        {activeProblem && !showRating && (
          <div className="problem-actions">
            {activeProblem.isMutation && (
              <span className="mutation-badge">MUTATION</span>
            )}
            <button
              type="button"
              className="view-problem-btn"
              onClick={() => vscodeApi.postMessage({ type: "viewProblem" })}
              aria-label="View problem statement"
            >
              <IconEye size={14} /> View Problem
            </button>
            <button
              type="button"
              className="code-stub-btn"
              onClick={() => vscodeApi.postMessage({ type: "createCodeStub" })}
              aria-label="Create code stub and test file"
            >
              <IconCode size={14} /> Code Stub
            </button>
            <button
              type="button"
              className="run-tests-btn"
              onClick={() => vscodeApi.postMessage({ type: "runTests" })}
              aria-label="Run tests"
            >
              <IconPlay size={14} /> Run Tests
            </button>
            <button
              type="button"
              className="regen-tests-btn"
              onClick={() => vscodeApi.postMessage({ type: "regenerateTests" })}
              aria-label="Regenerate test cases via AI"
              title="Regenerate 20+ test cases using AI"
            >
              <IconReset size={14} /> Regen Tests
            </button>
            <button
              type="button"
              className="give-up-btn"
              onClick={handleGiveUp}
              aria-label="Give up and switch to teacher mode"
            >
              <IconFlag size={14} /> Give Up
            </button>
          </div>
        )}

        {ratingConfirmation && (
          <div className="rating-confirmation">
            Rating recorded. <strong>{ratingConfirmation}</strong>
          </div>
        )}

        {exportToast && (
          <div className="export-toast">{exportToast}</div>
        )}

        {showProfile ? (
          <ProfilePanel onClose={() => setShowProfile(false)} />
        ) : showDashboard ? (
          <Dashboard onClose={() => setShowDashboard(false)} />
        ) : showProblems ? (
          <ProblemBrowser onClose={() => setShowProblems(false)} />
        ) : sessionLoading ? (
          <div className="chat-container">
            <SessionLoader
              progress={sessionProgress}
              streamedContent={sessionStreamContent}
              error={sessionError}
              onRetry={handleStartSession}
              onCancel={handleCancelSession}
            />
          </div>
        ) : showHistory ? (
          <div className="chat-history">
            <div className="chat-history-header">
              <span className="chat-history-title">Chat History</span>
              <input
                type="text"
                className="chat-history-search"
                placeholder="Search chats..."
                value={historySearch}
                onChange={(e) => handleHistorySearch(e.target.value)}
                aria-label="Search chat history"
              />
            </div>
            {chatHistory.length === 0 ? (
              <div className="chat-history-empty">
                {historySearch ? "No matching chats" : "No previous chats"}
              </div>
            ) : (
              <div className="chat-history-list">
                {chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-history-item${chat.id === activeChatId ? " chat-history-item--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="chat-history-item-body"
                      onClick={() => handleLoadChat(chat.id)}
                    >
                      <div className="chat-history-item-title">{chat.title}</div>
                      <div className="chat-history-item-meta">
                        <span className="chat-history-item-mode">{chat.mode}</span>
                        <span className="chat-history-item-count">{chat.messageCount} msgs</span>
                        <span className="chat-history-item-date">
                          {new Date(chat.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    <div className="chat-history-item-actions">
                      <button
                        type="button"
                        className="chat-history-action-btn chat-history-action-btn--export"
                        onClick={() => handleExportChat(chat.id, "markdown")}
                        title="Export as Markdown"
                        aria-label="Export chat as Markdown"
                      >
                        <IconDownload size={14} />
                      </button>
                      <button
                        type="button"
                        className="chat-history-action-btn chat-history-action-btn--delete"
                        onClick={() => handleDeleteChat(chat.id)}
                        title="Delete chat"
                        aria-label="Delete chat"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : messages.length === 0 && !activeProblem ? (
          <div className="chat-container chat-container--empty">
            <div className="chat-welcome">
              <div className="chat-welcome-glyph">&#x25CE;</div>
              {!modelsLoading && models.length === 0 ? (
                <>
                  <h3>Welcome to CodeDrill</h3>
                  <p className="welcome-subtitle">AI-powered interview practice with spaced repetition</p>
                  <div className="welcome-steps">
                    <div className="welcome-step" onClick={handleConfigureModels} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && handleConfigureModels()}>
                      <span className="welcome-step-num">1</span>
                      <span>Configure an AI model <small>(Ollama, OpenAI, Azure, etc.)</small></span>
                    </div>
                    <div className="welcome-step">
                      <span className="welcome-step-num">2</span>
                      <span>Click <strong>Practice</strong> to start your first session</span>
                    </div>
                    <div className="welcome-step">
                      <span className="welcome-step-num">3</span>
                      <span>Browse <strong>3000+</strong> problems in the <strong>Problems</strong> tab</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3>Welcome to CodeDrill</h3>
                  <p>Click <strong>Practice</strong> to start a session, or just type a question below.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <Chat messages={messages} isLoading={isLoading} onRegenerate={handleRegenerate} />
        )}

        <ChatInput
          onSend={sendMessage}
          onInterrupt={handleInterrupt}
          isLoading={isLoading}
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onConfigureModels={handleConfigureModels}
          mode={mode}
          onModeChange={handleModeChange}
          contextBadges={contextBadges}
          isSessionActive={activeProblem !== null}
        />
      </div>
    </VscodeContext.Provider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
