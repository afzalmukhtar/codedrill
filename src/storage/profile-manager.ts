import * as vscode from "vscode";
import type { ChatMessage } from "../ai/providers/types";
import type { LLMRouter } from "../ai/llm-router";
import { loadPromptTemplate, buildPrompt } from "../ai/personas/prompt-loader";

const PROFILE_FILENAME = "user_profile.md";
const CODEDRILL_DIR = ".codedrill";

/**
 * Interval (in total conversation messages) between automatic profile updates.
 * Per PRD: "After every 5 completed chat exchanges (10 messages)".
 */
const UPDATE_INTERVAL = 10;

/**
 * ProfileManager
 *
 * Manages the learner profile at `.codedrill/user_profile.md`.
 * Responsible for loading, saving, and triggering LLM-based profile
 * generation / updates from recent conversation history.
 */
export class ProfileManager {
  private readonly _profileUri: vscode.Uri | null;
  private readonly _extensionUri: vscode.Uri;

  /** Tracks the last message count at which a profile update was triggered. */
  private _lastUpdateMessageCount = 0;

  constructor(workspaceUri: vscode.Uri | undefined, extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;

    if (workspaceUri) {
      this._profileUri = vscode.Uri.joinPath(
        workspaceUri,
        CODEDRILL_DIR,
        PROFILE_FILENAME,
      );
    } else {
      this._profileUri = null;
    }
  }

  /**
   * Read `.codedrill/user_profile.md` if it exists.
   * Returns `null` when the file does not exist or no workspace is open.
   */
  async loadProfile(): Promise<string | null> {
    if (!this._profileUri) {
      return null;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this._profileUri);
      const content = new TextDecoder("utf-8").decode(bytes);
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Write the given content to `.codedrill/user_profile.md`,
   * creating the `.codedrill/` directory if necessary.
   */
  async saveProfile(content: string): Promise<void> {
    if (!this._profileUri) {
      return;
    }

    const dirUri = vscode.Uri.joinPath(this._profileUri, "..");
    try {
      await vscode.workspace.fs.stat(dirUri);
    } catch {
      await vscode.workspace.fs.createDirectory(dirUri);
    }

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(this._profileUri, encoder.encode(content));
  }

  /**
   * Determine whether a profile update should run.
   * Returns true every `UPDATE_INTERVAL` messages.
   */
  shouldUpdateProfile(messageCount: number): boolean {
    if (messageCount < UPDATE_INTERVAL) {
      return false;
    }

    const bucket = Math.floor(messageCount / UPDATE_INTERVAL);
    const lastBucket = Math.floor(this._lastUpdateMessageCount / UPDATE_INTERVAL);

    if (bucket > lastBucket) {
      this._lastUpdateMessageCount = messageCount;
      return true;
    }

    return false;
  }

  /**
   * Send recent messages + existing profile to the LLM via the
   * profile-analyzer prompt and collect the full (non-streaming) response.
   */
  async generateProfile(
    recentMessages: ChatMessage[],
    existingProfile: string | null,
    router: LLMRouter,
    model: string,
    statsContext?: string,
  ): Promise<string> {
    const template = await loadPromptTemplate(
      this._extensionUri,
      "profile-analyzer.md",
    );

    const formattedMessages = recentMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const enrichedMessages = statsContext
      ? `${formattedMessages}\n\n[system context]: ${statsContext}`
      : formattedMessages;

    const today = new Date().toISOString().slice(0, 10);

    const finalPrompt = buildPrompt(template, {
      date: today,
      existingProfile: existingProfile ?? "No existing profile yet.",
      recentMessages: enrichedMessages,
    });

    let fullContent = "";

    try {
      const stream = router.chat({
        model,
        messages: [],
        systemPrompt: finalPrompt,
        stream: true,
        temperature: 0.3,
      });

      for await (const chunk of stream) {
        if (chunk.type === "content" && chunk.content) {
          fullContent += chunk.content;
        } else if (chunk.type === "error") {
          console.error("[ProfileManager] LLM error during profile generation:", chunk.error);
          break;
        }
      }
    } catch (err) {
      console.error("[ProfileManager] Failed to generate profile:", err);
    }

    return fullContent.trim();
  }
}
