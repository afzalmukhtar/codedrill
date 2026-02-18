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

import * as vscode from "vscode";

const KEY_PREFIX = "codedrill.apikey.";

function storageKey(providerId: string): string {
  return `${KEY_PREFIX}${providerId}`;
}

export class SecretsManager {
  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.secretStorage.get(storageKey(providerId));
  }

  async setApiKey(providerId: string, key: string): Promise<void> {
    await this.secretStorage.store(storageKey(providerId), key);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    await this.secretStorage.delete(storageKey(providerId));
  }

  async hasApiKey(providerId: string): Promise<boolean> {
    const key = await this.getApiKey(providerId);
    return key !== undefined && key !== "";
  }
}
