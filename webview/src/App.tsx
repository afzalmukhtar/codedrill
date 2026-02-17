import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "chatResponse":
          setMessages((prev) => [
            ...prev,
            {
              role: message.role as "assistant",
              content: message.content as string,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
          break;
        case "modelsLoaded":
          setModels(message.models as ModelInfo[]);
          setSelectedModel(message.defaultModel as string);
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
    setIsLoading(true);
    vscodeApi.postMessage({ type: "sendMessage", text: text.trim() });
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    vscodeApi.postMessage({ type: "selectModel", modelId });
  }, []);

  return (
    <VscodeContext.Provider value={{ postMessage: vscodeApi.postMessage }}>
      <div className="sidebar-container">
        <header className="sidebar-header">
          <div className="sidebar-header-text">
            <span className="sidebar-title">CodeDrill</span>
            <span className="sidebar-subtitle">Agent</span>
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
        />
      </div>
    </VscodeContext.Provider>
  );
}
