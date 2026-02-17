import * as vscode from "vscode";
import * as path from "path";

/**
 * Chat Storage Service
 *
 * Persists chat sessions as individual JSON files inside `.codedrill/chats/`.
 * Each chat gets a UUID filename. An index of all chats is maintained
 * so the sidebar can show a history list without reading every file.
 */

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

export interface ChatSummary {
  id: string;
  title: string;
  mode: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export class ChatStorage {
  private _baseUri: vscode.Uri | undefined;

  constructor(private readonly _workspaceUri?: vscode.Uri) {}

  /**
   * Ensure the `.codedrill/chats/` directory exists.
   * Returns the URI to the chats folder, or undefined if no workspace.
   */
  async ensureStorageDir(): Promise<vscode.Uri | undefined> {
    const root = this._getRoot();
    if (!root) { return undefined; }

    const chatsDir = vscode.Uri.joinPath(root, ".codedrill", "chats");
    try {
      await vscode.workspace.fs.createDirectory(chatsDir);
    } catch {
      // directory may already exist
    }
    this._baseUri = chatsDir;
    return chatsDir;
  }

  /**
   * Save a chat session to disk.
   */
  async saveChat(session: ChatSession): Promise<void> {
    const dir = await this.ensureStorageDir();
    if (!dir) { return; }

    const fileUri = vscode.Uri.joinPath(dir, `${session.id}.json`);
    const content = JSON.stringify(session, null, 2);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));
  }

  /**
   * Load a specific chat session by ID.
   */
  async loadChat(chatId: string): Promise<ChatSession | null> {
    const dir = await this.ensureStorageDir();
    if (!dir) { return null; }

    const fileUri = vscode.Uri.joinPath(dir, `${chatId}.json`);
    try {
      const raw = await vscode.workspace.fs.readFile(fileUri);
      return JSON.parse(Buffer.from(raw).toString("utf-8")) as ChatSession;
    } catch {
      return null;
    }
  }

  /**
   * Delete a chat session.
   */
  async deleteChat(chatId: string): Promise<void> {
    const dir = await this.ensureStorageDir();
    if (!dir) { return; }

    const fileUri = vscode.Uri.joinPath(dir, `${chatId}.json`);
    try {
      await vscode.workspace.fs.delete(fileUri);
    } catch {
      // file may not exist
    }
  }

  /**
   * List all chat sessions as summaries (sorted by most recent first).
   * Reads each file but only returns metadata + preview, not full messages.
   */
  async listChats(): Promise<ChatSummary[]> {
    const dir = await this.ensureStorageDir();
    if (!dir) { return []; }

    const summaries: ChatSummary[] = [];

    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.File || !name.endsWith(".json")) {
          continue;
        }

        try {
          const fileUri = vscode.Uri.joinPath(dir, name);
          const raw = await vscode.workspace.fs.readFile(fileUri);
          const session = JSON.parse(Buffer.from(raw).toString("utf-8")) as ChatSession;

          const lastUserMsg = [...session.messages]
            .reverse()
            .find((m) => m.role === "user");

          summaries.push({
            id: session.id,
            title: session.title,
            mode: session.mode,
            model: session.model,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
            preview: lastUserMsg?.content.slice(0, 80) ?? "",
          });
        } catch {
          // skip malformed files
        }
      }
    } catch {
      // directory may not exist yet
    }

    summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    return summaries;
  }

  /**
   * Generate a chat title from the first user message.
   */
  static generateTitle(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\n/g, " ").trim();
    if (cleaned.length <= 50) { return cleaned; }
    return cleaned.slice(0, 47) + "...";
  }

  /**
   * Generate a new unique chat ID.
   */
  static newId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private _getRoot(): vscode.Uri | undefined {
    if (this._workspaceUri) { return this._workspaceUri; }
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri;
  }
}
