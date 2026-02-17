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

// import { ModelInfo } from "./providers/types";

export class ModelRegistry {
  // TODO: refreshModels(): Promise<ModelInfo[]>
  // TODO: getCachedModels(): ModelInfo[]
  // TODO: getModelById(id: string): ModelInfo | undefined
  // TODO: getModelsByProvider(providerId: string): ModelInfo[]
  // TODO: setDefaultModel(modelId: string): void
  // TODO: getDefaultModel(): string
}
