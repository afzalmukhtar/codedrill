/**
 * Model Registry
 *
 * Maintains the list of available models across all configured providers.
 * Handles model discovery, caching, and selection persistence.
 *
 * Responsibilities:
 * - Discover models from each enabled provider
 * - Cache model lists to avoid repeated API calls
 * - Persist the user's last selected model
 * - Group models by provider for the UI dropdown
 * - Provide model metadata (context window, cost, local/cloud)
 */

import type { ModelInfo } from "./providers/types";
import type { LLMRouter } from "./llm-router";

export class ModelRegistry {
  private _cachedModels: ModelInfo[] = [];
  private _defaultModel: string = "";

  constructor(private readonly router: LLMRouter) {}

  async refreshModels(): Promise<ModelInfo[]> {
    this._cachedModels = this.router.getAvailableModels();
    return this._cachedModels;
  }

  getCachedModels(): ModelInfo[] {
    return this._cachedModels;
  }

  getModelById(id: string): ModelInfo | undefined {
    return this._cachedModels.find((m) => m.id === id);
  }

  getModelsByProvider(providerId: string): ModelInfo[] {
    return this._cachedModels.filter((m) => m.provider === providerId);
  }

  setDefaultModel(modelId: string): void {
    this._defaultModel = modelId;
  }

  getDefaultModel(): string {
    return this._defaultModel;
  }
}
