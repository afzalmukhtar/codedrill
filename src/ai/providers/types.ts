/**
 * Shared Type Definitions for LLM Providers
 *
 * All provider implementations (OpenRouter, Ollama, OpenAI-compatible)
 * conform to these interfaces, enabling the LLM Router to treat them
 * uniformly regardless of backend.
 */

// ============================================================
// Provider Interface
// ============================================================

/**
 * Common interface implemented by all LLM provider backends.
 * The LLM Router uses this to discover models, send chat requests,
 * and check provider health across OpenRouter, Ollama, and custom endpoints.
 */
export interface LLMProvider {
  /** Unique provider identifier (e.g., "openrouter", "ollama", "openai") */
  readonly id: string;

  /** Human-readable provider name for the UI (e.g., "OpenRouter", "Ollama (Local)") */
  readonly name: string;

  /** Whether this provider runs models locally (no network needed) */
  readonly isLocal: boolean;

  /** Discover all models available from this provider */
  getAvailableModels(): Promise<ModelInfo[]>;

  /**
   * Send a chat completion request and receive a streaming response.
   * Returns an async iterable of chunks for real-time UI updates.
   */
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;

  /** Check if the provider is reachable and configured correctly */
  isAvailable(): Promise<boolean>;
}

// ============================================================
// Model Information
// ============================================================

/** Metadata about a single model available from a provider */
export interface ModelInfo {
  /** Model identifier used in API calls (e.g., "anthropic/claude-sonnet-4") */
  id: string;

  /** Human-readable name for the UI (e.g., "Claude Sonnet 4") */
  name: string;

  /** Which provider serves this model */
  provider: string;

  /** Maximum context window in tokens */
  contextWindow: number;

  /** Whether the model supports streaming responses */
  supportsStreaming: boolean;

  /** Whether the model supports tool/function calling */
  supportsTools: boolean;

  /** Cost per 1K input tokens in USD (null for local/free models) */
  costPer1kInput: number | null;

  /** Cost per 1K output tokens in USD (null for local/free models) */
  costPer1kOutput: number | null;

  /** True for Ollama and other local models */
  isLocal: boolean;

  /** Optional description or additional metadata */
  description?: string;
}

// ============================================================
// Chat Request / Response
// ============================================================

/** A single message in the conversation */
export interface ChatMessage {
  /** Role of the message sender */
  role: "system" | "user" | "assistant";

  /** Message content (may contain markdown) */
  content: string;

  /** Optional name for display purposes (e.g., "interviewer", "teacher") */
  name?: string;
}

/** A complete chat request sent to the LLM Router */
export interface ChatRequest {
  /** Model ID to use (e.g., "anthropic/claude-sonnet-4") */
  model: string;

  /** Conversation messages in chronological order */
  messages: ChatMessage[];

  /** System prompt to prepend (persona-specific) */
  systemPrompt: string;

  /** Sampling temperature (0.0 - 2.0, default varies by persona) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Whether to stream the response */
  stream: boolean;

  /** Force the model to output valid JSON. Supported by Ollama, OpenAI, Azure, OpenRouter. */
  responseFormat?: "json";

  /** IDE context attachments from @-mentions */
  context?: ContextAttachment[];

  /** AbortSignal for cancelling the request and underlying HTTP connection */
  signal?: AbortSignal;
}

/** A single chunk in a streaming response */
export interface ChatChunk {
  /** Chunk type */
  type: "content" | "error" | "done";

  /** Text content of this chunk (for type: "content") */
  content?: string;

  /** Error message (for type: "error") */
  error?: string;

  /** Token usage stats (sent with type: "done") */
  usage?: TokenUsage;
}

/** Token usage statistics for a completed response */
export interface TokenUsage {
  /** Number of tokens in the prompt (input) */
  promptTokens: number;

  /** Number of tokens in the completion (output) */
  completionTokens: number;

  /** Total tokens used */
  totalTokens: number;

  /** Estimated cost in USD (null if not available) */
  estimatedCostUsd: number | null;
}

// ============================================================
// Context Attachments
// ============================================================

/** Types of context that can be attached to messages via @-mentions */
export type ContextType =
  | "file"
  | "selection"
  | "symbol"
  | "problem"
  | "solution"
  | "terminal";

/** A resolved context attachment ready to be injected into LLM messages */
export interface ContextAttachment {
  /** Type of context */
  type: ContextType;

  /** Human-readable label for the UI badge (e.g., "utils/helpers.ts") */
  label: string;

  /** The actual content to inject into the LLM message */
  content: string;

  /** Estimated token count for this attachment */
  tokenEstimate: number;

  /** Optional metadata */
  metadata?: {
    /** File path (for type: "file") */
    filePath?: string;
    /** Line range (for type: "selection" or "symbol") */
    lineRange?: { start: number; end: number };
    /** Language identifier */
    language?: string;
    /** Symbol name (for type: "symbol") */
    symbolName?: string;
  };
}

// ============================================================
// Provider Configuration
// ============================================================

/** Configuration for a single provider, loaded from codedrill.config.json */
export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  name?: string;
  models?: string[];
}

/** Azure OpenAI-specific configuration */
export interface AzureOpenAIProviderConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  apiVersion?: string;
  deployment: string;
  displayName?: string;
}

/** Top-level providers configuration map */
export interface ProvidersConfig {
  openrouter?: ProviderConfig;
  ollama?: ProviderConfig;
  openai?: ProviderConfig;
  azureOpenai?: AzureOpenAIProviderConfig;
  anthropic?: ProviderConfig;
  google?: ProviderConfig;
  custom?: ProviderConfig;
}

// ============================================================
// Session Context (passed to Personas)
// ============================================================

/** Context provided to the Interviewer persona */
export interface InterviewContext {
  /** The problem being solved */
  problemStatement: string;
  problemTitle: string;
  problemDifficulty: "Easy" | "Medium" | "Hard";
  problemCategory: string;

  /** User's current code (may be empty) */
  userCode: string;

  /** How many times the user has seen this problem */
  attemptNumber: number;

  /** Current hint escalation level (1-5) */
  currentHintLevel: number;

  /** Time remaining on timer in milliseconds */
  timeRemainingMs: number;

  /** Previous attempt history for this problem */
  previousAttempts: AttemptSummary[];

  /** Whether this is a mutated version */
  isMutation: boolean;
  mutationDescription?: string;

  /** Additional IDE context from @-mentions */
  additionalContext?: ContextAttachment[];
}

/** Context provided to the Teacher persona */
export interface TeachingContext {
  /** The problem being explained */
  problemStatement: string;
  problemTitle: string;
  problemDifficulty: "Easy" | "Medium" | "Hard";
  problemCategory: string;

  /** User's attempted code (may have bugs or be incomplete) */
  userCode: string;

  /** How many times the user has seen this problem */
  attemptNumber: number;

  /** User's preferred programming language */
  preferredLanguage: string;

  /** Previous attempt history */
  previousAttempts: AttemptSummary[];

  /** Hints the interviewer gave (so teacher can build on them) */
  hintsGiven: string[];

  /** Whether this is a mutated version */
  isMutation: boolean;
  mutationDescription?: string;

  /** Additional IDE context from @-mentions */
  additionalContext?: ContextAttachment[];
}

/** Summary of a previous attempt for context */
export interface AttemptSummary {
  attemptNumber: number;
  rating: 1 | 2 | 3 | 4 | null;
  timeSpentMs: number | null;
  hintsUsed: number;
  gaveUp: boolean;
  wasMutation: boolean;
}

// ============================================================
// Webview <-> Extension Host Messages
// ============================================================

/** Messages sent from the webview to the extension host */
export type WebviewToExtensionMessage =
  | { type: "startSession" }
  | { type: "sendMessage"; text: string; mentions: MentionRef[] }
  | { type: "rateAttempt"; rating: 1 | 2 | 3 | 4 }
  | { type: "giveUp" }
  | { type: "requestHint" }
  | { type: "selectModel"; modelId: string }
  | { type: "refreshModels" }
  | { type: "timerAction"; action: "start" | "pause" | "resume" }
  | { type: "configureProviders" }
  | { type: "showDashboard" };

/** Messages sent from the extension host to the webview */
export type ExtensionToWebviewMessage =
  | { type: "sessionLoaded"; session: SessionData }
  | { type: "chatChunk"; chunk: ChatChunk; persona: "interviewer" | "teacher" }
  | { type: "modelsLoaded"; models: ModelInfo[]; defaultModel: string }
  | { type: "timerUpdate"; remainingMs: number; phase: "green" | "yellow" | "red" }
  | { type: "timerExpired" }
  | { type: "dashboardData"; data: DashboardData }
  | { type: "error"; message: string };

/** Reference to an @-mention from the chat input */
export interface MentionRef {
  type: ContextType;
  value?: string;
}

/** Session data sent to the webview */
export interface SessionData {
  sessionId: number;
  newProblem: ProblemSummary | null;
  reviewProblem: ProblemSummary | null;
}

/** Minimal problem info for the webview */
export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  description: string;
  examples: string;
  constraints: string;
  attemptCount: number;
  isMutation: boolean;
}

/** Dashboard analytics data */
export interface DashboardData {
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
  averageTimeMs: number;
  categoryProgress: Record<string, { solved: number; total: number }>;
  upcomingReviews: { date: string; count: number }[];
  weakCategories: string[];
  recentActivity: { date: string; count: number }[];
}
