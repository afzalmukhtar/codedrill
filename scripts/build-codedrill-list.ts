#!/usr/bin/env npx ts-node
/**
 * build-codedrill-list.ts
 *
 * Build-time aggregation script that produces a unified `codedrill.json`
 * by merging curated problem lists with company-wise data scraped from
 * popular GitHub repositories.
 *
 * Usage:
 *   npx ts-node scripts/build-codedrill-list.ts
 *
 * Outputs:
 *   src/leetcode/lists/codedrill.json
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { execSync } from "child_process";
import * as os from "os";

// ── Types ────────────────────────────────────────────────────────────

interface BundledEntry {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
}

interface BundledList {
  name: string;
  description: string;
  source: string;
  problems: BundledEntry[];
}

interface UnifiedProblem {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  pattern: string;
  companies: string[];
  leetcodeId: number | null;
  sources: string[];
}

// ── Pattern normalization ────────────────────────────────────────────

const PATTERN_MAP: Record<string, string> = {
  "arrays & hashing": "Hash Map",
  "array": "Array",
  "hashing": "Hash Map",
  "hash map": "Hash Map",
  "hash table": "Hash Map",
  "hash set": "Hash Map",
  "set": "Hash Map",
  "two pointers": "Two Pointers",
  "fast/slow pointers": "Two Pointers",
  "sliding window": "Sliding Window",
  "stack": "Stack",
  "monotonic stack": "Stack",
  "queue": "Queue",
  "binary search": "Binary Search",
  "linked list": "Linked List",
  "trees": "Trees",
  "tree": "Trees",
  "binary tree": "Trees",
  "binary search tree": "Trees",
  "bst": "Trees",
  "trie": "Trie",
  "prefix tree": "Trie",
  "heap": "Heap / Priority Queue",
  "heap / priority queue": "Heap / Priority Queue",
  "priority queue": "Heap / Priority Queue",
  "backtracking": "Backtracking",
  "graph": "Graph",
  "graphs": "Graph",
  "union find": "Graph",
  "union-find": "Graph",
  "topological sort": "Graph",
  "dynamic programming": "Dynamic Programming",
  "dp": "Dynamic Programming",
  "dynamic programming (1d)": "Dynamic Programming",
  "dynamic programming (2d)": "Dynamic Programming",
  "1-d dynamic programming": "Dynamic Programming",
  "2-d dynamic programming": "Dynamic Programming",
  "greedy": "Greedy",
  "intervals": "Intervals",
  "merge intervals": "Intervals",
  "bit manipulation": "Bit Manipulation",
  "bit magic": "Bit Manipulation",
  "binary": "Bit Manipulation",
  "math": "Math",
  "math & geometry": "Math",
  "mathematical": "Math",
  "divide and conquer": "Divide and Conquer",
  "design": "Design",
  "sorting": "Sorting",
  "string": "String",
  "recursion": "Backtracking",
  "segment tree": "Advanced",
  "line sweep": "Advanced",
  "tries": "Trie",
};

function normalizePattern(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return PATTERN_MAP[lower] ?? raw.trim();
}

function normalizeDifficulty(raw: string): "Easy" | "Medium" | "Hard" {
  const lower = raw.trim().toLowerCase();
  if (lower.includes("easy")) return "Easy";
  if (lower.includes("medium")) return "Medium";
  if (lower.includes("hard")) return "Hard";
  return "Medium";
}

// ── Utility: extract slug from a LeetCode URL ───────────────────────

function slugFromUrl(url: string): string | null {
  const match = url.match(/leetcode\.com\/problems\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

// ── Utility: fetch a URL as text ─────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = (u: string) => {
      https.get(u, { headers: { "User-Agent": "codedrill-builder" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
}

// ── Step 1: Read existing bundled lists ──────────────────────────────

function readBundledLists(listsDir: string): Map<string, UnifiedProblem> {
  const map = new Map<string, UnifiedProblem>();
  const files = ["neetcode150.json", "blind75.json", "grind75.json"];

  for (const file of files) {
    const fullPath = path.join(listsDir, file);
    if (!fs.existsSync(fullPath)) continue;

    const list: BundledList = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    const sourceName = file.replace(".json", "");

    for (const entry of list.problems) {
      const existing = map.get(entry.slug);
      if (existing) {
        if (!existing.sources.includes(sourceName)) {
          existing.sources.push(sourceName);
        }
      } else {
        map.set(entry.slug, {
          slug: entry.slug,
          title: entry.title,
          difficulty: entry.difficulty,
          category: entry.category,
          pattern: normalizePattern(entry.category),
          companies: [],
          leetcodeId: null,
          sources: [sourceName],
        });
      }
    }
  }

  console.log(`  [bundled] Loaded ${map.size} unique problems from ${files.length} lists`);
  return map;
}

// ── Step 2: Clone and parse company-wise repos ───────────────────────

function parseCompanyCsv(csvText: string, companyName: string, companyMap: Map<string, Set<string>>): number {
  const lines = csvText.split("\n");
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // CSV format: ID,URL,Title,Difficulty,Acceptance%,Frequency%
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const url = parts[1];
    if (!url) continue;
    const slug = slugFromUrl(url);
    if (!slug) continue;

    if (!companyMap.has(slug)) {
      companyMap.set(slug, new Set());
    }
    companyMap.get(slug)!.add(companyName);
    count++;
  }
  return count;
}

function processCompanyRepo(repoDir: string, companyMap: Map<string, Set<string>>): void {
  if (!fs.existsSync(repoDir)) return;

  const entries = fs.readdirSync(repoDir, { withFileTypes: true });
  let companiesProcessed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const companyDir = path.join(repoDir, entry.name);
    const companyName = entry.name;

    // Look for the "all" CSV variant
    const csvFiles = fs.readdirSync(companyDir).filter((f) => f.endsWith(".csv"));
    const allCsv = csvFiles.find((f) =>
      f.toLowerCase().includes("all") ||
      f.toLowerCase() === `${companyName.toLowerCase()}.csv`
    ) ?? csvFiles[csvFiles.length - 1]; // fallback to last file (usually the broadest)

    if (!allCsv) continue;

    try {
      const csvText = fs.readFileSync(path.join(companyDir, allCsv), "utf-8");
      parseCompanyCsv(csvText, companyName, companyMap);
      companiesProcessed++;
    } catch {
      // skip unreadable files
    }
  }

  console.log(`  [company] Processed ${companiesProcessed} company directories`);
}

interface CsvProblemMeta {
  slug: string;
  title: string;
  difficulty: string;
  leetcodeId: number | null;
}

function extractMetaFromCsvRepos(repoDir: string): Map<string, CsvProblemMeta> {
  const meta = new Map<string, CsvProblemMeta>();
  if (!fs.existsSync(repoDir)) return meta;

  const entries = fs.readdirSync(repoDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const companyDir = path.join(repoDir, entry.name);
    const csvFiles = fs.readdirSync(companyDir).filter((f) => f.endsWith(".csv"));
    const allCsv = csvFiles.find((f) => f.toLowerCase().includes("all")) ?? csvFiles[csvFiles.length - 1];
    if (!allCsv) continue;

    try {
      const lines = fs.readFileSync(path.join(companyDir, allCsv), "utf-8").split("\n");
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(",");
        if (parts.length < 4) continue;
        const id = parseInt(parts[0], 10);
        const url = parts[1];
        const title = parts[2];
        const diff = parts[3];
        const slug = slugFromUrl(url ?? "");
        if (!slug || meta.has(slug)) continue;
        meta.set(slug, {
          slug,
          title: title ?? slug,
          difficulty: diff ?? "Medium",
          leetcodeId: isNaN(id) ? null : id,
        });
      }
    } catch {
      // skip
    }
  }
  return meta;
}

// ── Step 3: Parse VikashPR MAANG-Interview-Prep README ───────────────

interface MaangEntry {
  slug: string;
  concepts: string;
}

function parseMaangReadme(readmeText: string): Map<string, MaangEntry> {
  const map = new Map<string, MaangEntry>();

  // Pattern: line with leetcode URL, followed by lines with concepts
  // The README uses markdown table-like format with URLs and concepts on nearby lines
  const urlRegex = /\[.*?\]\((https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/?)\)/g;
  const lines = readmeText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\[.*?\]\((https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/?)\)/);
    if (!match) continue;
    const slug = match[2];

    // The concepts are usually 1-2 lines after the URL line
    let concepts = "";
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const line = lines[j].trim();
      if (line.startsWith("http") || line.match(/^\d+$/) || line === "") continue;
      if (line.match(/\[.*?\]\(https?:/)) break; // next problem
      if (line.includes("MAANG") || line.includes("LC Top") || line.includes("Blind 75") || line.includes("NeetCode")) continue;
      if (!line.includes("leetcode.com") && line.length > 2 && line.length < 200) {
        concepts = line;
        break;
      }
    }

    if (slug && !map.has(slug)) {
      const clean = (concepts && !concepts.startsWith("---") && !concepts.startsWith("*("))
        ? concepts : "";
      map.set(slug, { slug, concepts: clean });
    }
  }

  console.log(`  [maang] Parsed ${map.size} problems with pattern data`);
  return map;
}

// ── Step 4: Parse aman0046 TOP-100-DSA README ────────────────────────

interface Top100Entry {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
}

function parseTop100Readme(readmeText: string): Top100Entry[] {
  const entries: Top100Entry[] = [];
  let currentCategory = "General";

  const lines = readmeText.split("\n");
  for (const line of lines) {
    // Section headers like "## 1. Arrays"
    const sectionMatch = line.match(/^##\s*\d+\.\s*(.+)/);
    if (sectionMatch) {
      currentCategory = sectionMatch[1].trim();
      continue;
    }

    // Problem lines like "- [Two Sum](https://leetcode.com/problems/two-sum/) - Easy"
    const problemMatch = line.match(
      /\[(.+?)\]\((https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/?)\)\s*-\s*(.*)/
    );
    if (problemMatch) {
      const title = problemMatch[1];
      const slug = problemMatch[3];
      const diffText = problemMatch[4];
      entries.push({
        slug,
        title,
        difficulty: normalizeDifficulty(diffText),
        category: currentCategory,
      });
    }
  }

  console.log(`  [top100] Parsed ${entries.length} problems`);
  return entries;
}

// ── Category-to-Pattern mapping for problems that lack pattern data ──

const CATEGORY_PATTERN_MAP: Record<string, string> = {
  "Arrays & Hashing": "Hash Map",
  "Array": "Array",
  "Arrays": "Array",
  "Two Pointers": "Two Pointers",
  "Sliding Window": "Sliding Window",
  "Stack": "Stack",
  "Stacks and Queues": "Stack",
  "Binary Search": "Binary Search",
  "Linked List": "Linked List",
  "Trees": "Trees",
  "Tree": "Trees",
  "Trie": "Trie",
  "Heap": "Heap / Priority Queue",
  "Backtracking": "Backtracking",
  "Graphs": "Graph",
  "Graph": "Graph",
  "Dynamic Programming": "Dynamic Programming",
  "Greedy": "Greedy",
  "Intervals": "Intervals",
  "Bit Manipulation": "Bit Manipulation",
  "Math & Geometry": "Math",
  "Advanced Graphs": "Graph",
  "1-D Dynamic Programming": "Dynamic Programming",
  "2-D Dynamic Programming": "Dynamic Programming",
  "Strings": "String",
  "String": "String",
};

// ── Main merge logic ─────────────────────────────────────────────────

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const listsDir = path.join(rootDir, "src", "leetcode", "lists");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codedrill-"));

  console.log("CodeDrill Problem List Builder");
  console.log("==============================\n");

  // 1. Read existing bundled lists
  console.log("Step 1: Reading bundled lists...");
  const problems = readBundledLists(listsDir);

  // 2. Clone company-wise repos
  console.log("\nStep 2: Cloning company-wise repos...");
  const companyMap = new Map<string, Set<string>>();

  const repos = [
    { url: "https://github.com/liquidslr/interview-company-wise-problems.git", name: "liquidslr" },
    { url: "https://github.com/snehasishroy/leetcode-companywise-interview-questions.git", name: "snehasishroy" },
  ];

  let csvMeta = new Map<string, CsvProblemMeta>();

  for (const repo of repos) {
    const repoDir = path.join(tmpDir, repo.name);
    console.log(`  Cloning ${repo.name}...`);
    try {
      execSync(`git clone --depth 1 --single-branch ${repo.url} "${repoDir}"`, {
        stdio: "pipe",
        timeout: 120_000,
      });
      processCompanyRepo(repoDir, companyMap);
      // Also extract metadata (title, difficulty, leetcodeId) from CSVs
      const meta = extractMetaFromCsvRepos(repoDir);
      for (const [slug, m] of meta) {
        if (!csvMeta.has(slug)) csvMeta.set(slug, m);
      }
    } catch (err) {
      console.warn(`  WARNING: Could not clone ${repo.name}: ${err}`);
    }
  }

  console.log(`  [company] Total: ${companyMap.size} unique slugs with company data`);

  // 3. Fetch and parse VikashPR MAANG-Interview-Prep README
  console.log("\nStep 3: Fetching VikashPR MAANG-Interview-Prep README...");
  let maangData = new Map<string, MaangEntry>();
  try {
    const readme = await fetchText(
      "https://raw.githubusercontent.com/VikashPR/MAANG-Interview-Prep-100-DSA/main/README.md"
    );
    maangData = parseMaangReadme(readme);
  } catch (err) {
    console.warn(`  WARNING: Could not fetch MAANG README: ${err}`);
  }

  // 4. Fetch and parse aman0046 TOP-100-DSA README
  console.log("\nStep 4: Fetching aman0046 TOP-100-DSA README...");
  let top100Data: Top100Entry[] = [];
  try {
    const readme = await fetchText(
      "https://raw.githubusercontent.com/aman0046/TOP-100-DSA-Interview-Questions/main/README.md"
    );
    top100Data = parseTop100Readme(readme);
  } catch (err) {
    console.warn(`  WARNING: Could not fetch TOP-100-DSA README: ${err}`);
  }

  // 5. Merge everything
  console.log("\nStep 5: Merging all sources...");

  // Add MAANG problems that aren't already in the map
  for (const [slug, entry] of maangData) {
    if (!problems.has(slug)) {
      const meta = csvMeta.get(slug);
      problems.set(slug, {
        slug,
        title: meta?.title ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        difficulty: meta?.difficulty ? normalizeDifficulty(meta.difficulty) : "Medium",
        category: entry.concepts.split(",")[0]?.trim() || "General",
        pattern: normalizePattern(entry.concepts.split(",")[0]?.trim() || "General"),
        companies: [],
        leetcodeId: meta?.leetcodeId ?? null,
        sources: ["maang100"],
      });
    } else {
      const p = problems.get(slug)!;
      if (!p.sources.includes("maang100")) p.sources.push("maang100");
    }

    // Enrich pattern from MAANG concepts if current pattern is generic
    const p = problems.get(slug)!;
    if (entry.concepts && (p.pattern === p.category || p.pattern === "General")) {
      const firstConcept = entry.concepts.split(",")[0]?.trim();
      if (firstConcept) {
        p.pattern = normalizePattern(firstConcept);
      }
    }
  }

  // Add TOP-100 problems
  for (const entry of top100Data) {
    if (!problems.has(entry.slug)) {
      const meta = csvMeta.get(entry.slug);
      problems.set(entry.slug, {
        slug: entry.slug,
        title: entry.title,
        difficulty: entry.difficulty,
        category: entry.category,
        pattern: CATEGORY_PATTERN_MAP[entry.category] ?? normalizePattern(entry.category),
        companies: [],
        leetcodeId: meta?.leetcodeId ?? null,
        sources: ["top100dsa"],
      });
    } else {
      const p = problems.get(entry.slug)!;
      if (!p.sources.includes("top100dsa")) p.sources.push("top100dsa");
    }
  }

  // Add problems discovered ONLY from company CSVs that aren't in any curated list
  for (const [slug, companies] of companyMap) {
    if (!problems.has(slug)) {
      const meta = csvMeta.get(slug);
      if (!meta) continue; // skip if we have no metadata at all
      problems.set(slug, {
        slug,
        title: meta.title,
        difficulty: normalizeDifficulty(meta.difficulty),
        category: "General",
        pattern: "General",
        companies: Array.from(companies).sort(),
        leetcodeId: meta.leetcodeId,
        sources: ["company-tagged"],
      });
    }
  }

  // Apply company data to all problems
  for (const [slug, p] of problems) {
    const companies = companyMap.get(slug);
    if (companies) {
      p.companies = Array.from(companies).sort();
    }
  }

  // Apply leetcodeId from CSV meta where missing
  for (const [slug, p] of problems) {
    if (!p.leetcodeId) {
      const meta = csvMeta.get(slug);
      if (meta?.leetcodeId) p.leetcodeId = meta.leetcodeId;
    }
  }

  // Normalize patterns using category fallback + clean stale values
  for (const [, p] of problems) {
    // Fix stale patterns from parsing artifacts
    if (p.pattern.startsWith("---") || p.pattern.startsWith("*(") || p.pattern.length > 40) {
      p.pattern = "General";
    }
    if (p.category.startsWith("---") || p.category.startsWith("*(") || p.category.length > 40) {
      p.category = "General";
    }
    // Re-normalize
    p.pattern = normalizePattern(p.pattern);
    // Fallback from category
    if (!p.pattern || p.pattern === "General" || p.pattern === p.category) {
      const mapped = CATEGORY_PATTERN_MAP[p.category];
      if (mapped) p.pattern = mapped;
    }
  }

  // 6. Sort and write output
  console.log("\nStep 6: Writing codedrill.json...");
  const sorted = Array.from(problems.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const diffOrder = { Easy: 0, Medium: 1, Hard: 2 };
    return diffOrder[a.difficulty] - diffOrder[b.difficulty];
  });

  const output = {
    name: "CodeDrill Master List",
    description: `Unified problem list aggregated from NeetCode 150, Blind 75, Grind 75, MAANG-Interview-Prep, TOP-100-DSA, and company-wise LeetCode data from 500+ companies. Generated ${new Date().toISOString().split("T")[0]}.`,
    source: "https://github.com/afzalmukhtar/codedrill",
    totalProblems: sorted.length,
    problems: sorted,
  };

  const outPath = path.join(listsDir, "codedrill.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  // Stats
  const withCompanies = sorted.filter((p) => p.companies.length > 0).length;
  const withPattern = sorted.filter((p) => p.pattern && p.pattern !== "General").length;
  const uniqueCompanies = new Set(sorted.flatMap((p) => p.companies));
  const uniquePatterns = new Set(sorted.map((p) => p.pattern).filter(Boolean));

  console.log(`\n${"=".repeat(50)}`);
  console.log(`DONE: ${outPath}`);
  console.log(`  Total problems:    ${sorted.length}`);
  console.log(`  With companies:    ${withCompanies}`);
  console.log(`  With patterns:     ${withPattern}`);
  console.log(`  Unique companies:  ${uniqueCompanies.size}`);
  console.log(`  Unique patterns:   ${uniquePatterns.size}`);
  console.log(`  Patterns: ${Array.from(uniquePatterns).sort().join(", ")}`);

  // Cleanup
  console.log("\nCleaning up temp directory...");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
