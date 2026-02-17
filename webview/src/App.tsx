import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Chat } from "./components/Chat";
import { ChatInput } from "./components/ChatInput";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

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
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export type DrillMode = "agent" | "teach" | "interview";

const MODE_LABELS: Record<DrillMode, string> = {
  agent: "Agent",
  teach: "Teach",
  interview: "Interview",
};

/** Shape of the persisted webview state. */
interface PersistedState {
  messages: ChatMessage[];
  selectedModel: string;
  mode: DrillMode;
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

export function App() {
  const persisted = useRef(loadPersistedState());

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => persisted.current?.messages ?? []
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => persisted.current?.selectedModel ?? ""
  );
  const [mode, setMode] = useState<DrillMode>(
    () => persisted.current?.mode ?? "agent"
  );
  const [isLoading, setIsLoading] = useState(false);
  const streamBufferRef = useRef<string>("");

  // Persist state whenever messages, selectedModel, or mode change
  useEffect(() => {
    const state: PersistedState = {
      messages: messages.map((m) => ({ ...m, isStreaming: false })),
      selectedModel,
      mode,
    };
    vscodeApi.setState(state);
  }, [messages, selectedModel, mode]);

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

        case "modelsLoaded":
          setModels(message.models as ModelInfo[]);
          if (message.defaultModel) {
            setSelectedModel(message.defaultModel as string);
          }
          break;

        // Restore conversation history sent from the extension host
        case "restoreMessages":
          if (Array.isArray(message.messages) && message.messages.length > 0) {
            setMessages(message.messages as ChatMessage[]);
          }
          break;

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
    setIsLoading(true);
    vscodeApi.postMessage({ type: "sendMessage", text: text.trim() });
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

  return (
    <VscodeContext.Provider value={{ postMessage: vscodeApi.postMessage }}>
      <div className="sidebar-container">
        <header className="sidebar-header">
          <div className="sidebar-header-text">
            <span className="sidebar-title">CodeDrill</span>
            <span className="sidebar-subtitle">{MODE_LABELS[mode]}</span>
          </div>
          <div className="sidebar-actions" aria-label="Sidebar actions">
            <button type="button" className="sidebar-action" title="History">↺</button>
            <button type="button" className="sidebar-action" title="Search">⌕</button>
            <button type="button" className="sidebar-action" title="Edit">✎</button>
          </div>
        </header>

        <Chat messages={messages} isLoading={isLoading} />
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onConfigureModels={handleConfigureModels}
          mode={mode}
          onModeChange={handleModeChange}
        />
      </div>
    </VscodeContext.Provider>
  );
}
