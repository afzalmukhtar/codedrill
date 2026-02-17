import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
  ProvidersConfig,
} from "./providers/types";
import { OllamaProvider } from "./providers/ollama";

/**
 * LLM Router -- Unified Provider Routing Layer
 *
 * Initialises enabled providers from config, aggregates their models,
 * and routes chat requests to the correct backend.
 *
 * Currently supports Ollama only. Structured so adding OpenRouter,
 * OpenAI, Anthropic etc. later is a one-line addition.
 */
export class LLMRouter {
  private _providers: Map<string, LLMProvider> = new Map();
  private _modelToProvider: Map<string, string> = new Map();
  private _models: ModelInfo[] = [];

  /**
   * Initialise providers based on the config.
   * Skips providers that are disabled or fail to init.
   */
  async initialize(config: ProvidersConfig): Promise<void> {
    this._providers.clear();
    this._modelToProvider.clear();
    this._models = [];

    // Ollama
    if (config.ollama?.enabled) {
      const host = config.ollama.baseUrl ?? "http://localhost:11434";
      console.log(`[LLMRouter] Ollama enabled, checking server at ${host}...`);
      try {
        const ollama = new OllamaProvider(config.ollama.baseUrl);
        const available = await ollama.isAvailable();
        if (available) {
          this._providers.set(ollama.id, ollama);
          console.log("[LLMRouter] Ollama provider initialised successfully");
        } else {
          console.warn(`[LLMRouter] Ollama enabled but server not reachable at ${host}. Is Ollama running?`);
        }
      } catch (err) {
        console.error("[LLMRouter] Failed to init Ollama:", err);
      }
    } else {
      console.log("[LLMRouter] Ollama not enabled in config (ollama.enabled =", config.ollama?.enabled, ")");
    }

    // Future: OpenRouter, OpenAI, Anthropic, etc.
    // if (config.openrouter?.enabled) { ... }
    // if (config.openai?.enabled) { ... }
    // if (config.anthropic?.enabled) { ... }

    // Discover models from all active providers
    await this._discoverModels();
  }

  /**
   * Return all discovered models across active providers.
   */
  getAvailableModels(): ModelInfo[] {
    return this._models;
  }

  /**
   * Stream a chat request to the appropriate provider.
   */
  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const providerId = this._modelToProvider.get(request.model);
    if (!providerId) {
      yield {
        type: "error",
        error: `No provider found for model "${request.model}". Check your configuration.`,
      };
      return;
    }

    const provider = this._providers.get(providerId);
    if (!provider) {
      yield {
        type: "error",
        error: `Provider "${providerId}" is not available.`,
      };
      return;
    }

    yield* provider.chat(request);
  }

  /**
   * Check health of all registered providers.
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [id, provider] of this._providers) {
      try {
        results.set(id, await provider.isAvailable());
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }

  /** Whether any providers are active. */
  get hasProviders(): boolean {
    return this._providers.size > 0;
  }

  // ---- internal ----

  private async _discoverModels(): Promise<void> {
    this._models = [];
    this._modelToProvider.clear();

    for (const [, provider] of this._providers) {
      try {
        const models = await provider.getAvailableModels();
        for (const model of models) {
          this._models.push(model);
          this._modelToProvider.set(model.id, provider.id);
        }
      } catch (err) {
        console.error(`[LLMRouter] Failed to discover models from ${provider.name}:`, err);
      }
    }

    console.log(`[LLMRouter] Discovered ${this._models.length} model(s) from ${this._providers.size} provider(s)`);
  }
}
