import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
  ProvidersConfig,
} from "./providers/types";
import { OllamaProvider } from "./providers/ollama";
import { AzureOpenAIProvider } from "./providers/azure-openai";
import { OpenAICompatProvider } from "./providers/openai-compat";
import { OpenRouterProvider } from "./providers/openrouter";

/**
 * LLM Router -- Unified Provider Routing Layer
 *
 * Initialises enabled providers from config, aggregates their models,
 * and routes chat requests to the correct backend.
 *
 * Supported providers: Ollama, Azure OpenAI, OpenAI, Anthropic,
 * Google AI, OpenRouter, and any custom OpenAI-compatible endpoint.
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

    // Azure OpenAI
    if (config.azureOpenai?.enabled) {
      const azCfg = config.azureOpenai;
      console.log(`[LLMRouter] Azure OpenAI enabled, deployment "${azCfg.deployment}" at ${azCfg.endpoint}`);
      try {
        const azure = new AzureOpenAIProvider({
          endpoint: azCfg.endpoint,
          apiKey: azCfg.apiKey,
          apiVersion: azCfg.apiVersion,
          deployment: azCfg.deployment,
          displayName: azCfg.displayName,
        });
        const available = await azure.isAvailable();
        if (available) {
          this._providers.set(azure.id, azure);
          console.log("[LLMRouter] Azure OpenAI provider initialised successfully");
        } else {
          console.warn("[LLMRouter] Azure OpenAI enabled but deployment not reachable. Check endpoint and API key.");
        }
      } catch (err) {
        console.error("[LLMRouter] Failed to init Azure OpenAI:", err);
      }
    }

    // OpenAI
    if (config.openai?.enabled && config.openai.apiKey) {
      console.log("[LLMRouter] OpenAI enabled");
      await this._initCompat({
        id: "openai",
        name: "OpenAI",
        baseUrl: config.openai.baseUrl ?? "https://api.openai.com/v1",
        apiKey: config.openai.apiKey,
        models: config.openai.models,
      });
    }

    // Anthropic (OpenAI-compatible endpoint)
    if (config.anthropic?.enabled && config.anthropic.apiKey) {
      console.log("[LLMRouter] Anthropic enabled");
      await this._initCompat({
        id: "anthropic",
        name: "Anthropic",
        baseUrl: config.anthropic.baseUrl ?? "https://api.anthropic.com/v1",
        apiKey: config.anthropic.apiKey,
        models: config.anthropic.models,
      });
    }

    // Google AI (OpenAI-compatible endpoint)
    if (config.google?.enabled && config.google.apiKey) {
      console.log("[LLMRouter] Google AI enabled");
      await this._initCompat({
        id: "google",
        name: "Google AI",
        baseUrl: config.google.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: config.google.apiKey,
        models: config.google.models,
      });
    }

    // Custom OpenAI-compatible endpoint (LM Studio, vLLM, etc.)
    if (config.custom?.enabled && config.custom.baseUrl) {
      console.log(`[LLMRouter] Custom provider "${config.custom.name ?? "Custom"}" at ${config.custom.baseUrl}`);
      await this._initCompat({
        id: "custom",
        name: config.custom.name ?? "Custom",
        baseUrl: config.custom.baseUrl,
        apiKey: config.custom.apiKey ?? "",
        models: config.custom.models,
      });
    }

    // OpenRouter (300+ models from 60+ providers)
    if (config.openrouter?.enabled && config.openrouter.apiKey) {
      console.log("[LLMRouter] OpenRouter enabled");
      try {
        const openrouter = new OpenRouterProvider(config.openrouter.apiKey);
        const available = await openrouter.isAvailable();
        if (available) {
          this._providers.set(openrouter.id, openrouter);
          console.log("[LLMRouter] OpenRouter provider initialised successfully");
        } else {
          console.warn("[LLMRouter] OpenRouter enabled but API not reachable. Check your API key.");
        }
      } catch (err) {
        console.error("[LLMRouter] Failed to init OpenRouter:", err);
      }
    }

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

  private async _initCompat(config: {
    id: string; name: string; baseUrl: string; apiKey: string; models?: string[];
  }): Promise<void> {
    try {
      const provider = new OpenAICompatProvider(config);
      const available = await provider.isAvailable();
      if (available) {
        this._providers.set(provider.id, provider);
        console.log(`[LLMRouter] ${config.name} provider initialised successfully`);
      } else {
        console.warn(`[LLMRouter] ${config.name} enabled but not reachable at ${config.baseUrl}. Check endpoint and API key.`);
      }
    } catch (err) {
      console.error(`[LLMRouter] Failed to init ${config.name}:`, err);
    }
  }

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
