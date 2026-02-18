import { AzureOpenAI } from "openai";
import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
} from "./types";

const AVAILABILITY_TIMEOUT_MS = 10_000;

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  apiVersion?: string;
  deployment: string;
  /** Human-readable name shown in the model selector. Falls back to deployment name. */
  displayName?: string;
}

/**
 * Azure OpenAI Provider
 *
 * Connects to an Azure OpenAI Service deployment.
 * Uses the official OpenAI SDK's AzureOpenAI client for full compatibility.
 */
export class AzureOpenAIProvider implements LLMProvider {
  readonly id = "azure-openai";
  readonly name = "Azure OpenAI";
  readonly isLocal = false;

  private _client: AzureOpenAI;
  private _deployment: string;
  private _displayName: string;
  private _endpoint: string;
  private _apiKey: string;
  private _apiVersion: string;

  constructor(config: AzureOpenAIConfig) {
    this._deployment = config.deployment;
    this._displayName = config.displayName ?? config.deployment;
    this._endpoint = config.endpoint.replace(/\/+$/, "");
    this._apiKey = config.apiKey;
    this._apiVersion = config.apiVersion ?? "2024-08-01-preview";

    this._client = new AzureOpenAI({
      endpoint: this._endpoint,
      apiKey: this._apiKey,
      apiVersion: this._apiVersion,
      deployment: this._deployment,
    });
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return [
      {
        id: `azure/${this._deployment}`,
        name: this._displayName,
        provider: this.name,
        contextWindow: 128_000,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kInput: null,
        costPer1kOutput: null,
        isLocal: false,
        description: `Azure OpenAI deployment: ${this._deployment}`,
      },
    ];
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

      const stream = await this._client.chat.completions.create(
        {
          model: this._deployment,
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

      const url = `${this._endpoint}/openai/models?api-version=${this._apiVersion}`;
      const response = await fetch(url, {
        headers: { "api-key": this._apiKey },
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }
}
