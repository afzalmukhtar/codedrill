import OpenAI from "openai";
import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
} from "./types";

const AVAILABILITY_TIMEOUT_MS = 10_000;

export interface OpenAICompatConfig {
  /** Unique identifier for this provider instance (e.g., "openai", "anthropic", "custom") */
  id: string;
  /** Human-readable name shown in the model selector */
  name: string;
  /** Base URL for the API (e.g., "https://api.openai.com/v1") */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /**
   * Explicit model list. When provided, these are returned directly
   * instead of calling /v1/models (useful for providers that don't
   * support model listing, or to restrict visible models).
   */
  models?: string[];
}

/**
 * OpenAI-Compatible Provider
 *
 * Implements LLMProvider for any endpoint that speaks the OpenAI chat
 * completions format. Covers OpenAI, Anthropic (compat endpoint),
 * Google AI (compat endpoint), LM Studio, vLLM, text-generation-inference,
 * and any custom server.
 *
 * Uses the official `openai` npm package with a `baseURL` override.
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;

  private _client: OpenAI;
  private _baseUrl: string;
  private _explicitModels: string[] | undefined;

  constructor(config: OpenAICompatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.isLocal = this._isLocalUrl(config.baseUrl);
    this._baseUrl = config.baseUrl.replace(/\/+$/, "");
    this._explicitModels = config.models;

    this._client = new OpenAI({
      apiKey: config.apiKey || "no-key",
      baseURL: this._baseUrl,
      dangerouslyAllowBrowser: false,
    });
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    if (this._explicitModels?.length) {
      return this._explicitModels.map((id) => this._toModelInfo(id, id));
    }

    try {
      const response = await this._client.models.list();
      const models: ModelInfo[] = [];
      for await (const m of response) {
        models.push(this._toModelInfo(m.id, m.id));
      }
      return models;
    } catch (err) {
      console.error(`[${this.name}] Failed to list models:`, err);
      return [];
    }
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

      if (request.systemPrompt) {
        messages.push({ role: "system", content: request.systemPrompt });
      }
      for (const m of request.messages) {
        messages.push({ role: m.role, content: m.content });
      }

      const modelId = request.model.includes("/")
        ? request.model.split("/").slice(1).join("/")
        : request.model;

      const stream = await this._client.chat.completions.create(
        {
          model: modelId,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: true,
        },
        request.signal ? { signal: request.signal } : undefined,
      );

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        if (request.signal?.aborted) { break; }
        const delta = chunk.choices?.[0]?.delta;

        if (delta?.content) {
          yield { type: "content", content: delta.content };
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      yield {
        type: "done",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUsd: null,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: message };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

      const response = await fetch(`${this._baseUrl}/models`, {
        headers: this._client.apiKey
          ? { Authorization: `Bearer ${this._client.apiKey}` }
          : {},
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  private _toModelInfo(id: string, displayName: string): ModelInfo {
    return {
      id: `${this.id}/${id}`,
      name: displayName,
      provider: this.name,
      contextWindow: 0,
      supportsStreaming: true,
      supportsTools: true,
      costPer1kInput: null,
      costPer1kOutput: null,
      isLocal: this.isLocal,
    };
  }

  private _isLocalUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "0.0.0.0";
    } catch {
      return false;
    }
  }
}
