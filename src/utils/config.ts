/**
 * Configuration Manager
 *
 * Manages extension settings from both VSCode settings and
 * the codedrill.config.json file. Handles merging, env var
 * resolution, and config file watching.
 *
 * Config priority:
 * 1. codedrill.config.json (highest)
 * 2. VSCode settings (contributes.configuration)
 * 3. Default values (lowest)
 *
 * API key resolution:
 * - ${ENV_VAR} syntax resolved from process.env
 * - Falls back to VSCode SecretStorage
 */

// import * as vscode from "vscode";

export class ConfigManager {
  // TODO: loadConfig(): Promise<CodeDrillConfig>
  // TODO: watchConfig(): vscode.Disposable
  // TODO: resolveEnvVars(value: string): string
  // TODO: getProviderConfig(providerId: string): ProviderConfig
  // TODO: getPreferences(): Preferences
  // TODO: validateConfig(config: unknown): ValidationResult
}
