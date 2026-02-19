import * as vscode from "vscode";
import initSqlJs, { type Database } from "sql.js";
import type { Problem, ReviewCard, Attempt, Session, SystemDesignTopic } from "./schema";

const CODEDRILL_DIR = ".codedrill";
const DB_FILENAME = "codedrill.db";

export interface CategoryStat {
  category: string;
  total: number;
  attempted: number;
  solved: number;
}

/**
 * Data Access Layer backed by sql.js (WASM SQLite).
 *
 * sql.js runs entirely in-memory; `persist()` writes the byte array
 * to disk via the VS Code filesystem API.
 */
export class Repository {
  private _db: Database | null = null;
  private _dbUri: vscode.Uri | null = null;

  /**
   * Initialize the database.
   * Loads sql-wasm.wasm from the extension's dist/ folder,
   * reads an existing DB from `.codedrill/codedrill.db` (or creates a new one),
   * then runs the schema to ensure all tables exist.
   */
  async initialize(
    extensionUri: vscode.Uri,
    workspaceUri?: vscode.Uri,
  ): Promise<void> {
    const wasmPath = vscode.Uri.joinPath(extensionUri, "dist", "sql-wasm.wasm");
    const wasmBinary = await vscode.workspace.fs.readFile(wasmPath);

    const SQL = await initSqlJs({
      wasmBinary: wasmBinary.buffer as ArrayBuffer,
    });

    const root = workspaceUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      this._db = new SQL.Database();
      await this._runSchema(extensionUri);
      return;
    }

    const dir = vscode.Uri.joinPath(root, CODEDRILL_DIR);
    try { await vscode.workspace.fs.createDirectory(dir); } catch { /* exists */ }

    this._dbUri = vscode.Uri.joinPath(dir, DB_FILENAME);

    try {
      const existing = await vscode.workspace.fs.readFile(this._dbUri);
      this._db = new SQL.Database(new Uint8Array(existing));
      console.log("[Repository] Loaded existing database");
    } catch {
      this._db = new SQL.Database();
      console.log("[Repository] Created new database");
    }

    await this._runSchema(extensionUri);
    await this.persist();
  }

  private async _runSchema(extensionUri: vscode.Uri): Promise<void> {
    if (!this._db) { return; }
    const schemaUri = vscode.Uri.joinPath(extensionUri, "dist", "schema.sql");
    const bytes = await vscode.workspace.fs.readFile(schemaUri);
    const sql = Buffer.from(bytes).toString("utf-8");
    this._db.run(sql);
    this._runMigrations();
  }

  private _runMigrations(): void {
    if (!this._db) { return; }
    // Add pattern column if missing (for databases created before Sprint 7)
    try {
      this._db.exec("SELECT pattern FROM problems LIMIT 1");
    } catch {
      try {
        this._db.run("ALTER TABLE problems ADD COLUMN pattern TEXT");
        console.log("[Repository] Migration: added pattern column to problems");
      } catch (e) {
        console.warn("[Repository] Migration pattern column failed (may already exist):", e);
      }
    }
    // Add companies column if missing (for databases created before Sprint 9)
    try {
      this._db.exec("SELECT companies FROM problems LIMIT 1");
    } catch {
      try {
        this._db.run("ALTER TABLE problems ADD COLUMN companies TEXT DEFAULT '[]'");
        console.log("[Repository] Migration: added companies column to problems");
      } catch (e) {
        console.warn("[Repository] Migration companies column failed (may already exist):", e);
      }
    }
    // Add difficulty/relevance columns to system_design_topics if missing
    try {
      this._db.exec("SELECT difficulty FROM system_design_topics LIMIT 1");
    } catch {
      try {
        this._db.run("ALTER TABLE system_design_topics ADD COLUMN difficulty TEXT DEFAULT 'Medium'");
        this._db.run("ALTER TABLE system_design_topics ADD COLUMN relevance TEXT DEFAULT ''");
        console.log("[Repository] Migration: added difficulty/relevance columns to system_design_topics");
      } catch (e) {
        console.warn("[Repository] Migration system_design_topics columns failed:", e);
      }
    }
  }

  private _batchMode = false;

  /**
   * Suppress auto-persist during bulk operations.
   * Call `endBatch()` when done to write once.
   */
  beginBatch(): void { this._batchMode = true; }

  async endBatch(): Promise<void> {
    this._batchMode = false;
    await this.persist();
  }

  async persist(): Promise<void> {
    if (this._batchMode) { return; }
    if (!this._db || !this._dbUri) { return; }
    const data = this._db.export();
    await vscode.workspace.fs.writeFile(this._dbUri, data);
  }

  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  private get db(): Database {
    if (!this._db) { throw new Error("Repository not initialized"); }
    return this._db;
  }

  // ================================================================
  // Problems
  // ================================================================

  async insertProblem(p: Omit<Problem, "id" | "fetchedAt">): Promise<number> {
    this.db.run(
      `INSERT OR IGNORE INTO problems
        (slug, title, difficulty, category, tags, description, examples, constraints, test_cases, hints, solution_code, source_list, leetcode_id, pattern, companies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.slug, p.title, p.difficulty, p.category,
        JSON.stringify(p.tags), p.description,
        JSON.stringify(p.examples), p.constraints,
        JSON.stringify(p.testCases), JSON.stringify(p.hints),
        p.solutionCode, p.sourceList, p.leetcodeId,
        p.pattern ?? null,
        JSON.stringify(p.companies ?? []),
      ],
    );
    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = (result[0]?.values[0]?.[0] as number) ?? 0;
    await this.persist();
    return id;
  }

  async updateProblem(slug: string, fields: Partial<Omit<Problem, "id" | "slug">>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (fields.description !== undefined) { sets.push("description = ?"); vals.push(fields.description); }
    if (fields.examples !== undefined) { sets.push("examples = ?"); vals.push(JSON.stringify(fields.examples)); }
    if (fields.constraints !== undefined) { sets.push("constraints = ?"); vals.push(fields.constraints); }
    if (fields.testCases !== undefined) { sets.push("test_cases = ?"); vals.push(JSON.stringify(fields.testCases)); }
    if (fields.hints !== undefined) { sets.push("hints = ?"); vals.push(JSON.stringify(fields.hints)); }
    if (fields.solutionCode !== undefined) { sets.push("solution_code = ?"); vals.push(fields.solutionCode); }
    if (fields.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(fields.tags)); }
    if (fields.leetcodeId !== undefined) { sets.push("leetcode_id = ?"); vals.push(fields.leetcodeId); }
    if (fields.pattern !== undefined) { sets.push("pattern = ?"); vals.push(fields.pattern); }
    if (fields.companies !== undefined) { sets.push("companies = ?"); vals.push(JSON.stringify(fields.companies)); }
    if (sets.length === 0) { return; }
    vals.push(slug);
    this.db.run(`UPDATE problems SET ${sets.join(", ")} WHERE slug = ?`, vals);
    await this.persist();
  }

  getProblemBySlug(slug: string): Problem | null {
    const rows = this.db.exec("SELECT * FROM problems WHERE slug = ? LIMIT 1", [slug]);
    if (!rows[0] || rows[0].values.length === 0) { return null; }
    return this._rowToProblem(rows[0].columns, rows[0].values[0]);
  }

  getProblemById(id: number): Problem | null {
    const rows = this.db.exec("SELECT * FROM problems WHERE id = ? LIMIT 1", [id]);
    if (!rows[0] || rows[0].values.length === 0) { return null; }
    return this._rowToProblem(rows[0].columns, rows[0].values[0]);
  }

  getProblemsForList(listName: string): Problem[] {
    const rows = this.db.exec("SELECT * FROM problems WHERE source_list = ?", [listName]);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToProblem(rows[0].columns, v));
  }

  getUnseenProblem(excludeCategories?: string[], difficulty?: string): Problem | null {
    let sql = `
      SELECT p.* FROM problems p
      WHERE p.id NOT IN (SELECT DISTINCT problem_id FROM attempts)
    `;
    const params: unknown[] = [];
    if (excludeCategories && excludeCategories.length > 0) {
      sql += ` AND p.category NOT IN (${excludeCategories.map(() => "?").join(",")})`;
      params.push(...excludeCategories);
    }
    if (difficulty) {
      sql += ` AND p.difficulty = ?`;
      params.push(difficulty);
    }
    sql += ` ORDER BY RANDOM() LIMIT 1`;
    const rows = this.db.exec(sql, params);
    if (!rows[0] || rows[0].values.length === 0) { return null; }
    return this._rowToProblem(rows[0].columns, rows[0].values[0]);
  }

  getCategories(): string[] {
    const rows = this.db.exec("SELECT DISTINCT category FROM problems ORDER BY category");
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => v[0] as string);
  }

  getProblemCount(): number {
    const rows = this.db.exec("SELECT COUNT(*) FROM problems");
    return (rows[0]?.values[0]?.[0] as number) ?? 0;
  }

  getPatternStats(): { pattern: string; total: number; solved: number }[] {
    const sql = `
      SELECT
        p.pattern,
        COUNT(DISTINCT p.id) AS total,
        COUNT(DISTINCT a.problem_id) AS solved
      FROM problems p
      LEFT JOIN attempts a ON a.problem_id = p.id
      WHERE p.pattern IS NOT NULL AND p.pattern != ''
      GROUP BY p.pattern
      ORDER BY p.pattern
    `;
    const rows = this.db.exec(sql);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => ({
      pattern: v[0] as string,
      total: v[1] as number,
      solved: v[2] as number,
    }));
  }

  /**
   * List all problems, optionally filtered by category.
   * Returns lightweight rows sorted by category then title.
   */
  listProblems(category?: string): Problem[] {
    let sql = "SELECT * FROM problems";
    const params: unknown[] = [];
    if (category) {
      sql += " WHERE category = ?";
      params.push(category);
    }
    sql += " ORDER BY category, title";
    const rows = this.db.exec(sql, params);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToProblem(rows[0].columns, v));
  }

  getProblemsWithoutDescription(): Problem[] {
    const rows = this.db.exec(
      "SELECT * FROM problems WHERE description IS NULL OR description = '' ORDER BY category, title",
    );
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToProblem(rows[0].columns, v));
  }

  private _rowToProblem(cols: string[], vals: unknown[]): Problem {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return {
      id: obj.id as number,
      slug: obj.slug as string,
      title: obj.title as string,
      difficulty: obj.difficulty as Problem["difficulty"],
      category: obj.category as string,
      tags: JSON.parse((obj.tags as string) || "[]"),
      description: (obj.description as string) || "",
      examples: JSON.parse((obj.examples as string) || "[]"),
      constraints: (obj.constraints as string) || "",
      testCases: JSON.parse((obj.test_cases as string) || "[]"),
      hints: JSON.parse((obj.hints as string) || "[]"),
      solutionCode: (obj.solution_code as string) || null,
      sourceList: (obj.source_list as string) || "",
      leetcodeId: (obj.leetcode_id as number) || null,
      pattern: (obj.pattern as string) || null,
      companies: JSON.parse((obj.companies as string) || "[]"),
      fetchedAt: (obj.fetched_at as string) || "",
    };
  }

  // ================================================================
  // Review Cards
  // ================================================================

  async getOrCreateCard(problemId: number, cardType: "dsa" | "system_design"): Promise<ReviewCard> {
    const rows = this.db.exec(
      "SELECT * FROM review_cards WHERE problem_id = ? AND card_type = ? LIMIT 1",
      [problemId, cardType],
    );
    if (rows[0] && rows[0].values.length > 0) {
      return this._rowToCard(rows[0].columns, rows[0].values[0]);
    }
    this.db.run(
      `INSERT INTO review_cards (problem_id, card_type, due) VALUES (?, ?, ?)`,
      [problemId, cardType, new Date().toISOString()],
    );
    await this.persist();
    return this.getOrCreateCard(problemId, cardType);
  }

  async updateCard(card: ReviewCard): Promise<void> {
    this.db.run(
      `UPDATE review_cards SET
        stability = ?, difficulty = ?, due = ?, last_review = ?,
        reps = ?, lapses = ?, state = ?, scheduled_days = ?, elapsed_days = ?
       WHERE id = ?`,
      [
        card.stability, card.difficulty, card.due, card.lastReview,
        card.reps, card.lapses, card.state,
        card.scheduledDays, card.elapsedDays, card.id,
      ],
    );
    await this.persist();
  }

  getCardById(id: number): ReviewCard | null {
    const rows = this.db.exec("SELECT * FROM review_cards WHERE id = ? LIMIT 1", [id]);
    if (!rows[0] || rows[0].values.length === 0) { return null; }
    return this._rowToCard(rows[0].columns, rows[0].values[0]);
  }

  getDueCards(limit: number): ReviewCard[] {
    const rows = this.db.exec(
      "SELECT * FROM review_cards WHERE due <= datetime('now') ORDER BY due ASC LIMIT ?",
      [limit],
    );
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToCard(rows[0].columns, v));
  }

  private _rowToCard(cols: string[], vals: unknown[]): ReviewCard {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return {
      id: obj.id as number,
      problemId: obj.problem_id as number,
      cardType: obj.card_type as ReviewCard["cardType"],
      stability: (obj.stability as number) || 0,
      difficulty: (obj.difficulty as number) || 0,
      due: obj.due as string,
      lastReview: (obj.last_review as string) || null,
      reps: (obj.reps as number) || 0,
      lapses: (obj.lapses as number) || 0,
      state: (obj.state as ReviewCard["state"]) || "New",
      scheduledDays: (obj.scheduled_days as number) || 0,
      elapsedDays: (obj.elapsed_days as number) || 0,
    };
  }

  // ================================================================
  // Attempts
  // ================================================================

  async insertAttempt(a: Omit<Attempt, "id">): Promise<number> {
    this.db.run(
      `INSERT INTO attempts
        (problem_id, card_id, started_at, finished_at, time_spent_ms, timer_limit_ms,
         rating, was_mutation, mutation_desc, user_code, ai_hints_used, gave_up, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.problemId, a.cardId, a.startedAt, a.finishedAt, a.timeSpentMs, a.timerLimitMs,
        a.rating, a.wasMutation ? 1 : 0, a.mutationDesc, a.userCode,
        a.aiHintsUsed, a.gaveUp ? 1 : 0, a.notes,
      ],
    );
    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = (result[0]?.values[0]?.[0] as number) ?? 0;
    await this.persist();
    return id;
  }

  getAttemptsForProblem(problemId: number): Attempt[] {
    const rows = this.db.exec("SELECT * FROM attempts WHERE problem_id = ? ORDER BY started_at DESC", [problemId]);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToAttempt(rows[0].columns, v));
  }

  getAttemptCount(problemId: number): number {
    const rows = this.db.exec("SELECT COUNT(*) FROM attempts WHERE problem_id = ?", [problemId]);
    return (rows[0]?.values[0]?.[0] as number) ?? 0;
  }

  private _rowToAttempt(cols: string[], vals: unknown[]): Attempt {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return {
      id: obj.id as number,
      problemId: obj.problem_id as number,
      cardId: obj.card_id as number,
      startedAt: obj.started_at as string,
      finishedAt: (obj.finished_at as string) || null,
      timeSpentMs: (obj.time_spent_ms as number) || null,
      timerLimitMs: (obj.timer_limit_ms as number) || null,
      rating: (obj.rating as Attempt["rating"]) || null,
      wasMutation: !!(obj.was_mutation),
      mutationDesc: (obj.mutation_desc as string) || null,
      userCode: (obj.user_code as string) || null,
      aiHintsUsed: (obj.ai_hints_used as number) || 0,
      gaveUp: !!(obj.gave_up),
      notes: (obj.notes as string) || null,
    };
  }

  // ================================================================
  // Sessions
  // ================================================================

  async insertSession(s: Omit<Session, "id">): Promise<number> {
    this.db.run(
      `INSERT INTO sessions (started_at, new_problem_id, review_problem_id, completed)
       VALUES (?, ?, ?, ?)`,
      [s.startedAt, s.newProblemId, s.reviewProblemId, s.completed ? 1 : 0],
    );
    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = (result[0]?.values[0]?.[0] as number) ?? 0;
    await this.persist();
    return id;
  }

  async updateSession(s: Session): Promise<void> {
    this.db.run(
      `UPDATE sessions SET new_problem_id = ?, review_problem_id = ?, completed = ? WHERE id = ?`,
      [s.newProblemId, s.reviewProblemId, s.completed ? 1 : 0, s.id],
    );
    await this.persist();
  }

  getRecentSessions(limit: number): Session[] {
    const rows = this.db.exec("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", [limit]);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToSession(rows[0].columns, v));
  }

  private _rowToSession(cols: string[], vals: unknown[]): Session {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return {
      id: obj.id as number,
      startedAt: obj.started_at as string,
      newProblemId: (obj.new_problem_id as number) || null,
      reviewProblemId: (obj.review_problem_id as number) || null,
      completed: !!(obj.completed),
    };
  }

  // ================================================================
  // Stats
  // ================================================================

  getTotalSolved(): number {
    const rows = this.db.exec(
      "SELECT COUNT(DISTINCT problem_id) FROM attempts WHERE rating IS NOT NULL AND rating >= 2",
    );
    return (rows[0]?.values[0]?.[0] as number) ?? 0;
  }

  getStreakDays(): number {
    const rows = this.db.exec(`
      SELECT DISTINCT date(started_at) as d FROM attempts
      WHERE started_at IS NOT NULL
      ORDER BY d DESC
    `);
    if (!rows[0]) { return 0; }
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const row of rows[0].values) {
      const d = new Date(row[0] as string);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === streak) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // -------------------------------------------------------
  // user_config key-value store
  // -------------------------------------------------------

  getUserConfig(key: string): string | null {
    const rows = this.db.exec("SELECT value FROM user_config WHERE key = ?", [key]);
    if (!rows[0]?.values[0]) { return null; }
    return rows[0].values[0][0] as string;
  }

  async setUserConfig(key: string, value: string): Promise<void> {
    this.db.run(
      "INSERT OR REPLACE INTO user_config (key, value) VALUES (?, ?)",
      [key, value],
    );
    await this.persist();
  }

  async deleteUserConfig(key: string): Promise<void> {
    this.db.run("DELETE FROM user_config WHERE key = ?", [key]);
    await this.persist();
  }

  /**
   * Get all distinct company names that appear in any problem.
   */
  getCompanies(): string[] {
    const rows = this.db.exec("SELECT companies FROM problems WHERE companies != '[]'");
    if (!rows[0]) { return []; }
    const all = new Set<string>();
    for (const row of rows[0].values) {
      const arr: string[] = JSON.parse((row[0] as string) || "[]");
      for (const c of arr) { all.add(c); }
    }
    return Array.from(all).sort();
  }

  /**
   * Get company coverage stats: how many problems solved per company.
   */
  getCompanyStats(): { company: string; total: number; solved: number }[] {
    const rows = this.db.exec(`
      SELECT p.companies, p.id,
        CASE WHEN EXISTS(SELECT 1 FROM attempts a WHERE a.problem_id = p.id AND a.rating >= 2) THEN 1 ELSE 0 END AS solved
      FROM problems p
      WHERE p.companies != '[]'
    `);
    if (!rows[0]) { return []; }
    const stats = new Map<string, { total: number; solved: number }>();
    for (const row of rows[0].values) {
      const companies: string[] = JSON.parse((row[0] as string) || "[]");
      const isSolved = (row[2] as number) === 1;
      for (const c of companies) {
        if (!stats.has(c)) { stats.set(c, { total: 0, solved: 0 }); }
        const s = stats.get(c)!;
        s.total++;
        if (isSolved) { s.solved++; }
      }
    }
    return Array.from(stats.entries())
      .map(([company, s]) => ({ company, ...s }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * List problems with optional filters for category, pattern, and company.
   */
  listProblemsFiltered(filters?: {
    category?: string;
    pattern?: string;
    company?: string;
    difficulty?: string;
  }): Problem[] {
    let sql = "SELECT * FROM problems WHERE 1=1";
    const params: unknown[] = [];
    if (filters?.category) {
      sql += " AND category = ?";
      params.push(filters.category);
    }
    if (filters?.pattern) {
      sql += " AND pattern = ?";
      params.push(filters.pattern);
    }
    if (filters?.difficulty) {
      sql += " AND difficulty = ?";
      params.push(filters.difficulty);
    }
    if (filters?.company) {
      sql += " AND companies LIKE ?";
      params.push(`%"${filters.company}"%`);
    }
    sql += " ORDER BY category, title";
    const rows = this.db.exec(sql, params);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToProblem(rows[0].columns, v));
  }

  /**
   * Get distinct patterns from the database.
   */
  getPatterns(): string[] {
    const rows = this.db.exec(
      "SELECT DISTINCT pattern FROM problems WHERE pattern IS NOT NULL AND pattern != '' AND pattern != 'General' ORDER BY pattern",
    );
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => v[0] as string);
  }

  getCategoryStats(): CategoryStat[] {
    const rows = this.db.exec(`
      SELECT
        p.category,
        COUNT(DISTINCT p.id) as total,
        COUNT(DISTINCT a.problem_id) as attempted,
        COUNT(DISTINCT CASE WHEN a.rating >= 3 THEN a.problem_id END) as solved
      FROM problems p
      LEFT JOIN attempts a ON a.problem_id = p.id
      GROUP BY p.category
      ORDER BY p.category
    `);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => ({
      category: v[0] as string,
      total: v[1] as number,
      attempted: v[2] as number,
      solved: v[3] as number,
    }));
  }

  // ================================================================
  // System Design Topics
  // ================================================================

  async insertSystemDesignTopic(t: Omit<SystemDesignTopic, "id">): Promise<number> {
    this.db.run(
      `INSERT INTO system_design_topics (title, category, description, key_concepts, follow_ups, source, difficulty, relevance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.title,
        t.category,
        t.description,
        JSON.stringify(t.keyConcepts ?? []),
        JSON.stringify(t.followUps ?? []),
        t.source ?? null,
        t.difficulty ?? "Medium",
        t.relevance ?? "",
      ],
    );
    const result = this.db.exec("SELECT last_insert_rowid() as id");
    const id = (result[0]?.values[0]?.[0] as number) ?? 0;
    await this.persist();
    return id;
  }

  getSystemDesignTopics(category?: string, source?: string): SystemDesignTopic[] {
    let sql = "SELECT * FROM system_design_topics";
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (category) { clauses.push("category = ?"); params.push(category); }
    if (source) { clauses.push("source = ?"); params.push(source); }
    if (clauses.length > 0) { sql += " WHERE " + clauses.join(" AND "); }
    sql += " ORDER BY category, title";
    const rows = this.db.exec(sql, params);
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => this._rowToSystemDesignTopic(rows[0].columns, v));
  }

  deleteSystemDesignTopicsBySource(source: string): void {
    this.db.run("DELETE FROM system_design_topics WHERE source = ?", [source]);
  }

  getSystemDesignTopicById(id: number): SystemDesignTopic | null {
    const rows = this.db.exec("SELECT * FROM system_design_topics WHERE id = ? LIMIT 1", [id]);
    if (!rows[0] || rows[0].values.length === 0) { return null; }
    return this._rowToSystemDesignTopic(rows[0].columns, rows[0].values[0]);
  }

  getSystemDesignCategories(): string[] {
    const rows = this.db.exec("SELECT DISTINCT category FROM system_design_topics ORDER BY category");
    if (!rows[0]) { return []; }
    return rows[0].values.map((v) => v[0] as string);
  }

  getSystemDesignTopicCount(): number {
    const rows = this.db.exec("SELECT COUNT(*) FROM system_design_topics");
    return (rows[0]?.values[0]?.[0] as number) ?? 0;
  }

  private _rowToSystemDesignTopic(cols: string[], vals: unknown[]): SystemDesignTopic {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return {
      id: obj.id as number,
      title: obj.title as string,
      category: obj.category as string,
      description: obj.description as string,
      keyConcepts: JSON.parse((obj.key_concepts as string) || "[]"),
      followUps: JSON.parse((obj.follow_ups as string) || "[]"),
      source: (obj.source as string) || null,
      difficulty: (obj.difficulty as "Easy" | "Medium" | "Hard") || "Medium",
      relevance: (obj.relevance as string) || "",
    };
  }
}
