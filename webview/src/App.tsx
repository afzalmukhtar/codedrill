import React, { createContext, useContext, useEffect, useState, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from "react";
import { Chat } from "./components/Chat";
import { ChatInput } from "./components/ChatInput";
import { Timer } from "./components/Timer";
import { RatingPanel } from "./components/RatingPanel";
import { SessionLoader, type SessionProgress } from "./components/SessionLoader";
import { ProblemBrowser } from "./components/ProblemBrowser";
import { Dashboard } from "./components/Dashboard";

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
  const [contextBadges, setContextBadges] = useState<ContextBadge[]>([]);
  const [showRating, setShowRating] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [ratingConfirmation, setRatingConfirmation] = useState<string | null>(null);
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

  // Keep ref in sync with state (for use in event handler closures)
  useEffect(() => { activeProblemRef.current = activeProblem; }, [activeProblem]);

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
    setShowHistory((prev) => !prev);
    setShowProblems(false);
    setShowDashboard(false);
  }, []);

  const handleLoadChat = useCallback((chatId: string) => {
    vscodeApi.postMessage({ type: "loadChat", chatId });
  }, []);

  const handleDeleteChat = useCallback((chatId: string) => {
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
    setSessionLoading(false);
    setSessionProgress(null);
    setSessionStreamContent("");
    setSessionError(null);
    sessionStreamRef.current = "";
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
          <div className="sidebar-header-text">
            <span className="sidebar-title">CodeDrill</span>
            <span className="sidebar-subtitle">{MODE_LABELS[mode]}</span>
          </div>
          <div className="sidebar-actions" aria-label="Sidebar actions">
            <button
              type="button"
              className={`sidebar-action${showDashboard ? " sidebar-action--active" : ""}`}
              title="Dashboard"
              onClick={() => { setShowDashboard((p) => !p); setShowHistory(false); setShowProblems(false); }}
            >
              ◈
            </button>
            <button
              type="button"
              className={`sidebar-action${showProblems ? " sidebar-action--active" : ""}`}
              title="Browse problems"
              onClick={() => { setShowProblems((p) => !p); setShowHistory(false); setShowDashboard(false); }}
            >
              ☰
            </button>
            <button
              type="button"
              className={`sidebar-action${showHistory ? " sidebar-action--active" : ""}`}
              title="Chat history"
              onClick={handleShowHistory}
            >
              ↺
            </button>
            <button
              type="button"
              className="sidebar-action"
              title="New chat"
              onClick={handleNewChat}
            >
              ✎
            </button>
          </div>
        </header>

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
            >
              View Problem
            </button>
            <button
              type="button"
              className="give-up-btn"
              onClick={handleGiveUp}
            >
              Give Up
            </button>
          </div>
        )}

        {ratingConfirmation && (
          <div className="rating-confirmation">
            Rating recorded. <strong>{ratingConfirmation}</strong>
          </div>
        )}

        {showDashboard ? (
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
            </div>
            {chatHistory.length === 0 ? (
              <div className="chat-history-empty">No previous chats</div>
            ) : (
              <div className="chat-history-list">
                {chatHistory.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={`chat-history-item${chat.id === activeChatId ? " chat-history-item--active" : ""}`}
                    onClick={() => handleLoadChat(chat.id)}
                  >
                    <div className="chat-history-item-title">{chat.title}</div>
                    <div className="chat-history-item-meta">
                      <span className="chat-history-item-mode">{chat.mode}</span>
                      <span className="chat-history-item-count">{chat.messageCount} msgs</span>
                      <span className="chat-history-item-date">
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        className="chat-history-item-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                        title="Delete chat"
                        aria-label="Delete chat"
                      >
                        ×
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : messages.length === 0 && !activeProblem ? (
          <div className="chat-container chat-container--empty">
            <div className="chat-welcome">
              <div className="chat-welcome-glyph">&#x25CE;</div>
              <h3>Welcome to CodeDrill</h3>
              <p>Ask a question to get started with your interview practice.</p>
              <button
                type="button"
                className="session-start-btn"
                onClick={handleStartSession}
              >
                Start Practice Session
              </button>
            </div>
          </div>
        ) : (
          <Chat messages={messages} isLoading={isLoading} />
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
