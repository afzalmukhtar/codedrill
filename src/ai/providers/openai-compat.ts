/**
 * OpenAI-Compatible Provider
 *
 * Implements LLMProvider for any endpoint that speaks the OpenAI API format.
 * This covers:
 * - OpenAI directly
 * - Anthropic (via their OpenAI-compatible endpoint)
 * - Google AI / Gemini (via OpenAI-compatible endpoint)
 * - LM Studio
 * - vLLM, text-generation-inference
 * - Any custom OpenAI-compatible server
 *
 * Uses the openai npm package as the client.
 */

// import { LLMProvider, ModelInfo, ChatRequest, ChatChunk } from "./types";

export class OpenAICompatProvider /* implements LLMProvider */ {
  // TODO: constructor(config: { id, name, baseUrl, apiKey, models? })
  // TODO: getAvailableModels(): Promise<ModelInfo[]>
  // TODO: chat(params: ChatRequest): AsyncIterable<ChatChunk>
  // TODO: isAvailable(): Promise<boolean>
}
