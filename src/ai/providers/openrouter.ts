import OpenAI from "openai";
import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
} from "./types";

const BASE_URL = "https://openrouter.ai/api/v1";
const AVAILABILITY_TIMEOUT_MS = 10_000;

interface OpenRouterModelData {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  description?: string;
}

/**
 * OpenRouter Provider
 *
 * Gives access to 300+ cloud models from 60+ providers through a single
 * API key. Uses the `openai` package with a baseURL override since
 * OpenRouter speaks the OpenAI chat completions format.
 *
 * Model discovery fetches real pricing and context window data from
 * the OpenRouter catalog and caches it for the session lifetime.
 */
export class OpenRouterProvider implements LLMProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";
  readonly isLocal = false;

  private _client: OpenAI;
  private _apiKey: string;
  private _cachedModels: ModelInfo[] | null = null;

  constructor(apiKey: string) {
    this._apiKey = apiKey;
    this._client = new OpenAI({
      apiKey,
      baseURL: BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/afzalmukhtar/codedrill",
        "X-Title": "CodeDrill",
      },
      dangerouslyAllowBrowser: false,
    });
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    if (this._cachedModels) {
      return this._cachedModels;
    }

    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this._apiKey}` },
      });

      if (!response.ok) {
        console.error(`[OpenRouter] Model fetch failed: ${response.status}`);
        return [];
      }

      const body = (await response.json()) as { data?: OpenRouterModelData[] };
      const models = (body.data ?? []).map((m): ModelInfo => ({
        id: `openrouter/${m.id}`,
        name: m.name || m.id,
        provider: this.name,
        contextWindow: m.context_length ?? 0,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kInput: m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1000 : null,
        costPer1kOutput: m.pricing?.completion ? parseFloat(m.pricing.completion) * 1000 : null,
        isLocal: false,
        description: m.description,
      }));

      this._cachedModels = models;
      console.log(`[OpenRouter] Discovered ${models.length} models`);
      return models;
    } catch (err) {
      console.error("[OpenRouter] Failed to list models:", err);
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

      // Strip the "openrouter/" prefix so the API gets the raw model id
      const modelId = request.model.startsWith("openrouter/")
        ? request.model.slice("openrouter/".length)
        : request.model;

      const stream = await this._client.chat.completions.create(
        {
          model: modelId,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: true,
          ...(request.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {}),
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

      const response = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this._apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }
}
