import * as vscode from "vscode";
import type { Repository } from "../db/repository";

export type GitMode = "existing" | "standalone" | "none";

interface WorkspaceConfig {
  gitMode?: GitMode;
  preferredLanguage?: string;
}

/**
 * Manages the codedrill-practice/ workspace directory:
 * - Smart git detection and initialization
 * - Problem folder scaffolding (problem.md, {slug}.py, test_{slug}.py)
 * - Auto-commit on problem creation and solution submission
 * - README.md progress report generation
 */
export class WorkspaceManager {
  private _workspaceUri: vscode.Uri | null = null;
  private _practiceUri: vscode.Uri | null = null;
  private _gitMode: GitMode = "none";
  private _initialized = false;

  constructor(
    private readonly _repository: Repository | null,
    private readonly _configUri: vscode.Uri | null,
  ) {}

  get practiceDir(): vscode.Uri | null { return this._practiceUri; }
  get gitMode(): GitMode { return this._gitMode; }

  /**
   * Convert a problem slug like "two-sum" or "3sum" into a valid
   * Python module name: "two_sum", "_3sum".
   */
  static slugToModule(slug: string): string {
    let mod = slug.replace(/-/g, "_").replace(/[^a-z0-9_]/gi, "");
    if (/^\d/.test(mod)) { mod = `_${mod}`; }
    return mod || "solution";
  }

  /**
   * Convert a problem slug into a camelCase function name matching
   * LeetCode's convention: "two-sum" → "twoSum", "3sum" → "threeSum".
   */
  static slugToFunctionName(slug: string): string {
    const DIGIT_WORDS: Record<string, string> = {
      "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
      "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    };
    const parts = slug.split("-").filter(Boolean);
    const camel = parts.map((p, i) => {
      let word = p.replace(/[^a-z0-9]/gi, "");
      if (/^\d/.test(word)) {
        word = word.replace(/^\d+/, (digits) =>
          [...digits].map((d) => DIGIT_WORDS[d] ?? d).join(""),
        );
      }
      if (i === 0) { return word.toLowerCase(); }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join("");
    return camel || "solve";
  }

  /**
   * Build a Python code stub with a deterministic function name.
   * If a LeetCode codeStub exists, return it as-is (it already has the right name).
   * Otherwise, generate a stub using the slug-derived function name.
   */
  static buildCodeStub(slug: string, existingStub: string | null): { code: string; functionName: string } {
    if (existingStub) {
      const fnMatch = existingStub.match(/def\s+(\w+)\s*\(self/);
      if (fnMatch) {
        return {
          code: `from typing import List, Optional, Dict, Tuple, Set\n\n\n${existingStub}\n`,
          functionName: fnMatch[1],
        };
      }
    }

    const fn = WorkspaceManager.slugToFunctionName(slug);
    const code = [
      "from typing import List, Optional, Dict, Tuple, Set",
      "",
      "",
      "class Solution:",
      `    def ${fn}(self):`,
      "        pass",
      "",
    ].join("\n");
    return { code, functionName: fn };
  }

  async ensureWorkspace(): Promise<vscode.Uri | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }

    this._workspaceUri = folders[0].uri;
    this._practiceUri = vscode.Uri.joinPath(this._workspaceUri, "codedrill-practice");

    if (this._initialized) { return this._practiceUri; }

    const saved = await this._loadConfig();
    if (saved.gitMode) {
      this._gitMode = saved.gitMode;
    } else {
      this._gitMode = await this._promptGitSetup();
      await this._saveConfig({ ...saved, gitMode: this._gitMode });
    }

    await this._ensureDir(this._practiceUri);
    await this._ensureDir(vscode.Uri.joinPath(this._practiceUri, "problems"));

    if (this._gitMode !== "none") {
      await this._initGitIfNeeded();
      await this._ensureGitignore();
    }

    await this._ensureConftest();
    this._initialized = true;
    return this._practiceUri;
  }

  async scaffoldProblem(
    slug: string,
    problemMd: string,
    stubCode: string,
    testCode: string,
  ): Promise<{ problemDir: vscode.Uri; solutionUri: vscode.Uri }> {
    if (!this._practiceUri) { throw new Error("Workspace not initialized"); }

    const mod = WorkspaceManager.slugToModule(slug);
    const problemDir = vscode.Uri.joinPath(this._practiceUri, "problems", slug);
    await this._ensureDir(problemDir);

    const problemUri = vscode.Uri.joinPath(problemDir, "problem.md");
    const solutionUri = vscode.Uri.joinPath(problemDir, `${mod}.py`);
    const testUri = vscode.Uri.joinPath(problemDir, `test_${mod}.py`);

    await vscode.workspace.fs.writeFile(problemUri, Buffer.from(problemMd, "utf-8"));
    await vscode.workspace.fs.writeFile(solutionUri, Buffer.from(stubCode, "utf-8"));
    await vscode.workspace.fs.writeFile(testUri, Buffer.from(testCode, "utf-8"));

    return { problemDir, solutionUri };
  }

  async commitProblem(slug: string): Promise<void> {
    if (this._gitMode === "none" || !this._workspaceUri) return;
    await this._gitExec(`add codedrill-practice/problems/${slug} README.md`);
    await this._gitExec(`commit -m "Add: ${slug}" --allow-empty`);
  }

  async commitSolution(slug: string, difficulty: string, timeStr: string): Promise<void> {
    if (this._gitMode === "none" || !this._workspaceUri) return;
    await this._gitExec("add .");
    await this._gitExec(`commit -m "Solve: ${slug} (${difficulty}, ${timeStr})" --allow-empty`);
  }

  async updateReadme(): Promise<void> {
    if (!this._workspaceUri || !this._repository) return;

    const readme = this._generateReadmeContent();
    const readmeUri = vscode.Uri.joinPath(this._workspaceUri, "README.md");
    await vscode.workspace.fs.writeFile(readmeUri, Buffer.from(readme, "utf-8"));
  }

  buildTestFile(
    slug: string,
    functionName: string,
    className: string,
    leetcodeExamples: Array<{ input: string; output: string; description?: string }>,
    llmEdgeCases: Array<{ input: string; expected_output: string; description?: string }>,
  ): string {
    const mod = WorkspaceManager.slugToModule(slug);
    const lines: string[] = [
      "import pytest",
      "import sys",
      "import os",
      "",
      "sys.path.insert(0, os.path.dirname(__file__))",
      `from ${mod} import ${className}`,
      "",
      "",
      `class Test${className}:`,
      "    def setup_method(self):",
      `        self.sol = ${className}()`,
      "",
    ];

    leetcodeExamples.forEach((ex, i) => {
      lines.push(`    def test_example_${i + 1}(self):`);
      if (ex.description) {
        lines.push(`        \"\"\"${ex.description}\"\"\"`);
      }
      lines.push(`        assert self.sol.${functionName}(${ex.input}) == ${ex.output}`);
      lines.push("");
    });

    llmEdgeCases.forEach((tc, i) => {
      const name = tc.description
        ? tc.description.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "")
        : `edge_case_${i + 1}`;
      lines.push(`    def test_${name}(self):`);
      if (tc.description) {
        lines.push(`        \"\"\"${tc.description}\"\"\"`);
      }
      lines.push(`        assert self.sol.${functionName}(${tc.input}) == ${tc.expected_output}`);
      lines.push("");
    });

    return lines.join("\n");
  }

  // ── Private helpers ──

  private async _promptGitSetup(): Promise<GitMode> {
    const hasGit = await this._hasGitRepo();

    if (hasGit) {
      const choice = await vscode.window.showInformationMessage(
        "CodeDrill: Use this git repo to track your practice progress?",
        "Yes, use this repo",
        "No thanks",
      );
      return choice === "Yes, use this repo" ? "existing" : "none";
    }

    const choice = await vscode.window.showInformationMessage(
      "CodeDrill: Initialize a git repo to track your practice progress?",
      "Yes, init git",
      "No thanks",
    );
    return choice === "Yes, init git" ? "standalone" : "none";
  }

  private async _hasGitRepo(): Promise<boolean> {
    if (!this._workspaceUri) return false;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(this._workspaceUri, ".git"));
      return true;
    } catch { return false; }
  }

  private async _initGitIfNeeded(): Promise<void> {
    if (!this._workspaceUri) return;
    const hasGit = await this._hasGitRepo();
    if (!hasGit && this._gitMode === "standalone") {
      await this._gitExec("init");
    }
  }

  private async _ensureGitignore(): Promise<void> {
    if (!this._workspaceUri) return;
    const gitignoreUri = vscode.Uri.joinPath(this._workspaceUri, ".gitignore");
    const entries = [
      "__pycache__/",
      "*.pyc",
      ".pytest_cache/",
      ".codedrill/",
      "codedrill.config.json",
    ];

    let existing = "";
    try {
      const data = await vscode.workspace.fs.readFile(gitignoreUri);
      existing = Buffer.from(data).toString("utf-8");
    } catch { /* file doesn't exist */ }

    const toAdd = entries.filter((e) => !existing.includes(e));
    if (toAdd.length > 0) {
      const appended = existing.endsWith("\n") || existing === ""
        ? existing + toAdd.join("\n") + "\n"
        : existing + "\n" + toAdd.join("\n") + "\n";
      await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(appended, "utf-8"));
    }
  }

  private async _ensureConftest(): Promise<void> {
    if (!this._practiceUri) return;
    const uri = vscode.Uri.joinPath(this._practiceUri, "conftest.py");
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from("# pytest configuration for CodeDrill practice\n", "utf-8"));
    }
  }

  private async _ensureDir(uri: vscode.Uri): Promise<void> {
    try { await vscode.workspace.fs.stat(uri); } catch {
      await vscode.workspace.fs.createDirectory(uri);
    }
  }

  private async _gitExec(args: string): Promise<void> {
    if (!this._workspaceUri) return;
    const cwd = this._workspaceUri.fsPath;
    try {
      const cp = await import("child_process");
      const util = await import("util");
      const exec = util.promisify(cp.exec);
      await exec(`git ${args}`, { cwd });
    } catch (err) {
      console.warn(`[WorkspaceManager] git ${args} failed:`, err);
    }
  }

  private _generateReadmeContent(): string {
    if (!this._repository) return "# CodeDrill Practice Log\n\nNo data yet.\n";

    let totalSolved = 0;
    let totalAttempted = 0;
    let streakDays = 0;
    let categoryStats: Array<{ category: string; total: number; attempted: number; solved: number }> = [];

    try {
      totalSolved = this._repository.getTotalSolved();
      totalAttempted = this._repository.getTotalAttempted?.() ?? totalSolved;
      streakDays = this._repository.getStreakDays();
      categoryStats = this._repository.getCategoryStats();
    } catch { /* DB may not be ready */ }

    const diffStats = { easy: { s: 0, t: 0 }, medium: { s: 0, t: 0 }, hard: { s: 0, t: 0 } };
    for (const c of categoryStats) {
      diffStats.medium.t += c.total;
      diffStats.medium.s += c.solved;
    }

    const bar = (solved: number, total: number, width = 10): string => {
      if (total === 0) return "░".repeat(width) + " 0%";
      const pct = Math.round((solved / total) * 100);
      const filled = Math.round((solved / total) * width);
      return "█".repeat(filled) + "░".repeat(width - filled) + ` ${pct}%`;
    };

    const lines = [
      "# CodeDrill Practice Log",
      "",
      "> Auto-generated by [CodeDrill](https://github.com/) -- AI-powered DSA interview prep",
      "",
      "## Stats",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Problems Solved | ${totalSolved} |`,
      `| Current Streak | ${streakDays} days |`,
      "",
      "## Progress by Category",
      "",
      "| Category | Solved | Total | Progress |",
      "|----------|--------|-------|----------|",
    ];

    for (const c of categoryStats) {
      lines.push(`| ${c.category} | ${c.solved} | ${c.total} | ${bar(c.solved, c.total)} |`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`*Last updated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC*`);
    lines.push("");

    return lines.join("\n");
  }

  private async _loadConfig(): Promise<WorkspaceConfig> {
    if (!this._configUri) return {};
    try {
      const configDir = vscode.Uri.joinPath(this._configUri, ".codedrill");
      const configFile = vscode.Uri.joinPath(configDir, "codedrill.config.json");
      const data = await vscode.workspace.fs.readFile(configFile);
      return JSON.parse(Buffer.from(data).toString("utf-8")) as WorkspaceConfig;
    } catch { return {}; }
  }

  private async _saveConfig(config: WorkspaceConfig): Promise<void> {
    if (!this._configUri) return;
    try {
      const configDir = vscode.Uri.joinPath(this._configUri, ".codedrill");
      await this._ensureDir(configDir);
      const configFile = vscode.Uri.joinPath(configDir, "codedrill.config.json");
      const existing = await this._loadConfig();
      const merged = { ...existing, ...config };
      await vscode.workspace.fs.writeFile(configFile, Buffer.from(JSON.stringify(merged, null, 2), "utf-8"));
    } catch (e) { console.warn("[WorkspaceManager] Failed to save config:", e); }
  }
}
