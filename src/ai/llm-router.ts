/**
 * LLM Router - Unified Provider Routing Layer
 *
 * Abstracts over multiple LLM provider backends (OpenRouter, Ollama,
 * direct APIs, custom endpoints) and provides a single interface
 * for the rest of the extension.
 *
 * Responsibilities:
 * - Load provider configurations from codedrill.config.json
 * - Aggregate available models from all enabled providers
 * - Route chat requests to the correct provider based on selected model
 * - Handle streaming responses uniformly across providers
 * - Graceful fallback when a provider is unavailable
 */

// import { LLMProvider, ModelInfo, ChatRequest, ChatChunk } from "./providers/types";
// import { OpenRouterProvider } from "./providers/openrouter";
// import { OllamaProvider } from "./providers/ollama";
// import { OpenAICompatProvider } from "./providers/openai-compat";

export class LLMRouter {
  // TODO: constructor(config: ProvidersConfig)
  // TODO: initialize(): Promise<void>
  // TODO: getAvailableModels(): Promise<ModelInfo[]>
  // TODO: chat(request: ChatRequest): AsyncIterable<ChatChunk>
  // TODO: getActiveProvider(modelId: string): LLMProvider
  // TODO: healthCheck(): Promise<Map<string, boolean>>
}
