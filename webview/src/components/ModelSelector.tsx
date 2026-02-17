import React from "react";
import type { ModelInfo } from "../App";

interface ModelSelectorProps {
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onConfigure: () => void;
  compact?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  onConfigure,
  compact = false,
}: ModelSelectorProps) {
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {});

  const hasModels = models.length > 0;

  return (
    <div className="model-selector">
      <button
        className="model-selector-add"
        type="button"
        onClick={onConfigure}
        title="Configure models"
        aria-label="Configure models"
      >
        +
      </button>
      <select
        className={`model-selector-dropdown${compact ? " model-selector-dropdown--compact" : ""}${!hasModels ? " model-selector-dropdown--disabled" : ""}`}
        value={hasModels ? selectedModel : ""}
        onChange={(event) => onModelChange(event.target.value)}
        disabled={!hasModels}
        aria-label="Select model"
      >
        {!hasModels && (
          <option value="">No models</option>
        )}
        {Object.entries(grouped).map(([provider, providerModels]) => (
          <optgroup key={provider} label={provider}>
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
