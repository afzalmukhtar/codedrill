import * as vscode from "vscode";
import type { ProviderConfig, ProvidersConfig } from "../ai/providers/types";

/**
 * Typed config shape loaded from codedrill.config.json.
 */
export interface CodeDrillConfig {
  providers: ProvidersConfig;
  defaultModel?: string;
  preferences?: Record<string, unknown>;
}

const EMPTY_CONFIG: CodeDrillConfig = { providers: {} };

/**
 * Configuration Manager
 *
 * Reads codedrill.config.json from the workspace root,
 * resolves ${ENV_VAR} patterns, and returns a typed config object.
 * If the file is missing or malformed, returns an empty config
 * so the UI can gracefully show "Configure Models...".
 */
export class ConfigManager {
  private _config: CodeDrillConfig = EMPTY_CONFIG;
  private _workspaceUri: vscode.Uri | undefined;
  private _extensionUri: vscode.Uri | undefined;

  constructor(workspaceUri?: vscode.Uri, extensionUri?: vscode.Uri) {
    this._workspaceUri = workspaceUri;
    this._extensionUri = extensionUri;
  }

  /**
   * Load (or reload) config from codedrill.config.json.
   * Safe to call multiple times -- always re-reads from disk.
   *
   * Search order:
   *   1. Workspace root  (per-project config)
   *   2. Extension install directory  (dev / bundled fallback)
   */
  async loadConfig(): Promise<CodeDrillConfig> {
    if (!this._workspaceUri) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this._workspaceUri = folders[0].uri;
      }
    }

    // Build candidate URIs in priority order
    const candidates: vscode.Uri[] = [];

    if (this._workspaceUri) {
      candidates.push(vscode.Uri.joinPath(this._workspaceUri, "codedrill.config.json"));
    }
    if (this._extensionUri) {
      candidates.push(vscode.Uri.joinPath(this._extensionUri, "codedrill.config.json"));
    }

    if (candidates.length === 0) {
      console.warn("[ConfigManager] No workspace folder and no extension URI -- returning empty config");
      this._config = EMPTY_CONFIG;
      return this._config;
    }

    for (const configUri of candidates) {
      try {
        const raw = await vscode.workspace.fs.readFile(configUri);
        const text = Buffer.from(raw).toString("utf-8");
        const parsed = JSON.parse(text) as Record<string, unknown>;

        const providers = this._resolveProviders(
          (parsed.providers as Record<string, unknown>) ?? {}
        );

        this._config = {
          providers,
          defaultModel: typeof parsed.defaultModel === "string"
            ? parsed.defaultModel
            : undefined,
          preferences: typeof parsed.preferences === "object" && parsed.preferences !== null
            ? (parsed.preferences as Record<string, unknown>)
            : undefined,
        };

        console.log(`[ConfigManager] Loaded config from ${configUri.fsPath}`);
        return this._config;
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "FileNotFound" || code === "ENOENT") {
          console.info(`[ConfigManager] Not found: ${configUri.fsPath}`);
        } else {
          console.error(`[ConfigManager] Error reading ${configUri.fsPath}:`, err);
        }
      }
    }

    console.warn("[ConfigManager] codedrill.config.json not found in any search path -- using empty config");
    this._config = EMPTY_CONFIG;
    return this._config;
  }

  /** Return already-loaded config (call loadConfig first). */
  get config(): CodeDrillConfig {
    return this._config;
  }

  /** Return config for a single provider by id. */
  getProviderConfig(id: keyof ProvidersConfig): ProviderConfig | undefined {
    return this._config.providers[id];
  }

  /** Get the path to the config file (used to open it in the editor). */
  getConfigFileUri(): vscode.Uri | undefined {
    if (!this._workspaceUri) { return undefined; }
    return vscode.Uri.joinPath(this._workspaceUri, "codedrill.config.json");
  }

  // ---- internal helpers ----

  /**
   * Walk through the providers object and resolve env vars in string values.
   */
  private _resolveProviders(raw: Record<string, unknown>): ProvidersConfig {
    const result: Record<string, ProviderConfig> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== "object" || value === null) { continue; }
      const src = value as Record<string, unknown>;

      result[key] = {
        enabled: src.enabled === true,
        apiKey: typeof src.apiKey === "string"
          ? this._resolveEnvVars(src.apiKey)
          : undefined,
        baseUrl: typeof src.baseUrl === "string"
          ? src.baseUrl
          : undefined,
        name: typeof src.name === "string" ? src.name : undefined,
        models: Array.isArray(src.models)
          ? (src.models as string[])
          : undefined,
      };
    }

    return result as ProvidersConfig;
  }

  /**
   * Replace ${ENV_VAR} patterns with process.env values.
   * Returns the original string if the env var is not set.
   */
  private _resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const envValue = process.env[varName];
      if (envValue !== undefined) {
        return envValue;
      }
      console.warn(`[ConfigManager] Env var ${varName} not set`);
      return `\${${varName}}`;
    });
  }
}
