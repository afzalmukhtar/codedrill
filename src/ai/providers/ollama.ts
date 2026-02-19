import { Ollama } from "ollama";
import type {
  LLMProvider,
  ModelInfo,
  ChatRequest,
  ChatChunk,
} from "./types";

const DEFAULT_HOST = "http://localhost:11434";
const AVAILABILITY_TIMEOUT_MS = 15_000;

/**
 * Ollama Provider
 *
 * Local LLM inference via Ollama. No API key needed.
 * Auto-discovers installed models and streams chat completions.
 */
export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";
  readonly isLocal = true;

  private _client: Ollama;

  constructor(host?: string) {
    this._client = new Ollama({ host: host ?? DEFAULT_HOST });
  }

  /**
   * Discover all models installed on the local Ollama server.
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await this._client.list();
      return response.models.map((m) => ({
        id: m.name,
        name: m.name,
        provider: this.name,
        contextWindow: 0,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kInput: null,
        costPer1kOutput: null,
        isLocal: true,
        description: `${m.details?.parameter_size ?? ""} ${m.details?.quantization_level ?? ""}`.trim() || undefined,
      }));
    } catch (err) {
      console.error("[OllamaProvider] Failed to list models:", err);
      return [];
    }
  }

  /**
   * Stream a chat completion from Ollama.
   */
  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    try {
      const messages = request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      if (request.systemPrompt) {
        messages.unshift({ role: "system", content: request.systemPrompt });
      }

      const stream = await this._client.chat({
        model: request.model,
        messages,
        stream: true,
        ...(request.responseFormat === "json" ? { format: "json" } : {}),
        options: {
          temperature: request.temperature ?? 0.7,
          ...(request.maxTokens ? { num_predict: request.maxTokens } : {}),
        },
      });

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        if (request.signal?.aborted) { break; }
        if (chunk.message?.content) {
          yield {
            type: "content",
            content: chunk.message.content,
          };
        }

        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count ?? 0;
          completionTokens = chunk.eval_count ?? 0;
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

  /**
   * Check if Ollama is reachable by listing models with a timeout.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

      const host = (this._client as unknown as { config: { host: string } }).config?.host ?? DEFAULT_HOST;
      const response = await fetch(`${host}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }
}
