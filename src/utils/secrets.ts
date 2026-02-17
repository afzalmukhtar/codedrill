/**
 * Secrets Manager
 *
 * Wraps VSCode's SecretStorage API for secure API key management.
 * Keys are stored encrypted in the OS keychain, never in plaintext.
 *
 * The first-run setup wizard stores keys here.
 * The config manager checks SecretStorage as a fallback
 * when ${ENV_VAR} resolution fails.
 */

// import * as vscode from "vscode";

export class SecretsManager {
  // TODO: constructor(secretStorage: vscode.SecretStorage)
  // TODO: getApiKey(providerId: string): Promise<string | undefined>
  // TODO: setApiKey(providerId: string, key: string): Promise<void>
  // TODO: deleteApiKey(providerId: string): Promise<void>
  // TODO: hasApiKey(providerId: string): Promise<boolean>
}
