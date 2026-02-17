import React from "react";
import type { ModelInfo } from "../App";

interface ModelSelectorProps {
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  compact?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  compact = false,
}: ModelSelectorProps) {
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {});

  return (
    <div className="model-selector">
      <select
        className={`model-selector-dropdown${compact ? " model-selector-dropdown--compact" : ""}`}
        value={selectedModel}
        onChange={(event) => onModelChange(event.target.value)}
        aria-label="Select model"
      >
        {models.length === 0 && (
          <option value="" disabled>
            Loading models...
          </option>
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
