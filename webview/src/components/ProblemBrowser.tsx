import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useVscode } from "../App";
import { IconClose } from "./Icons";

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  pattern: string | null;
  companies: string[];
  hasDescription: boolean;
  attemptCount: number;
}

export interface SystemDesignTopicSummary {
  id: number;
  title: string;
  category: string;
  description: string;
  keyConcepts: string[];
  followUps: string[];
  source: string | null;
  difficulty: string;
  relevance: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "#22c55e",
  Medium: "#eab308",
  Hard: "#ef4444",
};

type BrowserTab = "dsa" | "systemDesign";

interface ProblemBrowserProps {
  onClose: () => void;
}

export function ProblemBrowser({ onClose }: ProblemBrowserProps) {
  const { postMessage } = useVscode();
  const [activeTab, setActiveTab] = useState<BrowserTab>("dsa");

  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [systemDesignTopics, setSystemDesignTopics] = useState<SystemDesignTopicSummary[]>([]);
  const [systemDesignCategories, setSystemDesignCategories] = useState<string[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPattern, setSelectedPattern] = useState<string>("all");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedSystemDesignCategory, setSelectedSystemDesignCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [systemDesignSearch, setSystemDesignSearch] = useState("");

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "problemList") {
        setProblems(msg.problems as ProblemSummary[]);
      } else if (msg.type === "categoryList") {
        setCategories(msg.categories as string[]);
      } else if (msg.type === "patternList") {
        setPatterns(msg.patterns as string[]);
      } else if (msg.type === "companyList") {
        setCompanies(msg.companies as string[]);
      } else if (msg.type === "systemDesignTopicList") {
        const topics = msg.topics as SystemDesignTopicSummary[];
        setSystemDesignTopics(topics);
        const cats = Array.from(new Set(topics.map((t) => t.category))).sort();
        setSystemDesignCategories(cats);
      }
    };
    window.addEventListener("message", handler);
    postMessage({ type: "getCategories" });
    postMessage({ type: "getPatterns" });
    postMessage({ type: "getCompanies" });
    postMessage({ type: "listProblems" });
    postMessage({ type: "listSystemDesignTopics" });
    return () => window.removeEventListener("message", handler);
  }, [postMessage]);

  const applyFilters = useCallback(() => {
    const hasFilter =
      selectedCategory !== "all" ||
      selectedPattern !== "all" ||
      selectedCompany !== "all" ||
      selectedDifficulty !== "all";

    if (hasFilter) {
      postMessage({
        type: "listProblemsFiltered",
        category: selectedCategory !== "all" ? selectedCategory : undefined,
        pattern: selectedPattern !== "all" ? selectedPattern : undefined,
        company: selectedCompany !== "all" ? selectedCompany : undefined,
        difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
      });
    } else {
      postMessage({ type: "listProblems" });
    }
  }, [postMessage, selectedCategory, selectedPattern, selectedCompany, selectedDifficulty]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleOpen = useCallback((slug: string) => {
    postMessage({ type: "openProblem", slug });
    onClose();
  }, [postMessage, onClose]);

  const handleOpenSystemDesignTopic = useCallback((topicId: number) => {
    postMessage({ type: "openSystemDesignTopic", topicId });
    onClose();
  }, [postMessage, onClose]);

  const handlePromoteSystemDesign = useCallback((e: React.MouseEvent, topicId: number) => {
    e.stopPropagation();
    postMessage({ type: "promoteSystemDesign", topicId });
    onClose();
  }, [postMessage, onClose]);

  const filtered = useMemo(() => {
    if (!search) return problems;
    const lower = search.toLowerCase();
    return problems.filter((p) =>
      p.title.toLowerCase().includes(lower) ||
      p.slug.toLowerCase().includes(lower)
    );
  }, [problems, search]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, ProblemSummary[]>>((acc, p) => {
      (acc[p.category] ??= []).push(p);
      return acc;
    }, {});
  }, [filtered]);

  const filteredSystemDesign = useMemo(() => {
    let topics = systemDesignTopics;
    if (selectedSystemDesignCategory !== "all") {
      topics = topics.filter((t) => t.category === selectedSystemDesignCategory);
    }
    if (systemDesignSearch) {
      const lower = systemDesignSearch.toLowerCase();
      topics = topics.filter((t) =>
        t.title.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        (t.keyConcepts ?? []).some((k) => k.toLowerCase().includes(lower))
      );
    }
    return topics;
  }, [systemDesignTopics, selectedSystemDesignCategory, systemDesignSearch]);

  const groupedSystemDesign = useMemo(() => {
    return filteredSystemDesign.reduce<Record<string, SystemDesignTopicSummary[]>>((acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    }, {});
  }, [filteredSystemDesign]);

  const clearFilters = useCallback(() => {
    setSelectedCategory("all");
    setSelectedPattern("all");
    setSelectedCompany("all");
    setSelectedDifficulty("all");
    setSearch("");
  }, []);

  const clearSystemDesignFilters = useCallback(() => {
    setSelectedSystemDesignCategory("all");
    setSystemDesignSearch("");
  }, []);

  const hasActiveFilters = selectedCategory !== "all" || selectedPattern !== "all" || selectedCompany !== "all" || selectedDifficulty !== "all" || search;
  const hasActiveSystemDesignFilters = selectedSystemDesignCategory !== "all" || systemDesignSearch;

  return (
    <div className="problem-browser">
      <div className="problem-browser-header">
        <span className="problem-browser-title">Problems</span>
        <span className="problem-browser-count">
          {activeTab === "dsa" ? filtered.length : filteredSystemDesign.length}
        </span>
        <button type="button" className="problem-browser-close" onClick={onClose} title="Close">
          <IconClose size={14} />
        </button>
      </div>

      <div className="problem-browser-tabs">
        <button
          type="button"
          className={`problem-browser-tab${activeTab === "dsa" ? " problem-browser-tab--active" : ""}`}
          onClick={() => setActiveTab("dsa")}
        >
          DSA Problems
        </button>
        <button
          type="button"
          className={`problem-browser-tab${activeTab === "systemDesign" ? " problem-browser-tab--active" : ""}`}
          onClick={() => setActiveTab("systemDesign")}
        >
          System Design
        </button>
      </div>

      {activeTab === "dsa" ? (
        <>
          <div className="problem-browser-filters">
            <input
              type="text"
              className="problem-browser-search"
              placeholder="Search problems..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="problem-browser-dropdowns">
              <select
                className="problem-browser-select"
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <select
                className="problem-browser-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                className="problem-browser-select"
                value={selectedPattern}
                onChange={(e) => setSelectedPattern(e.target.value)}
              >
                <option value="all">All Patterns</option>
                {patterns.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                className="problem-browser-select"
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
              >
                <option value="all">All Companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button type="button" className="problem-browser-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div className="problem-browser-list">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="problem-browser-group">
                <div className="problem-browser-group-header">{category}</div>
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="problem-browser-item"
                    onClick={() => handleOpen(p.slug)}
                  >
                    <div className="problem-browser-item-main">
                      <span
                        className="problem-browser-diff"
                        style={{ color: DIFFICULTY_COLORS[p.difficulty] }}
                      >
                        {p.difficulty[0]}
                      </span>
                      <span className="problem-browser-item-title">{p.title}</span>
                      {p.pattern && (
                        <span className="problem-browser-pattern">{p.pattern}</span>
                      )}
                      {p.attemptCount > 0 && (
                        <span className="problem-browser-attempts">{p.attemptCount}x</span>
                      )}
                    </div>
                    {p.companies.length > 0 && (
                      <div className="problem-browser-companies">
                        {p.companies.slice(0, 5).map((c) => (
                          <span key={c} className="problem-browser-company-chip">{c}</span>
                        ))}
                        {p.companies.length > 5 && (
                          <span className="problem-browser-company-chip problem-browser-company-more">
                            +{p.companies.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="problem-browser-empty">No problems found</div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="problem-browser-filters">
            <input
              type="text"
              className="problem-browser-search"
              placeholder="Search topics..."
              value={systemDesignSearch}
              onChange={(e) => setSystemDesignSearch(e.target.value)}
            />

            <div className="problem-browser-dropdowns">
              <select
                className="problem-browser-select"
                value={selectedSystemDesignCategory}
                onChange={(e) => setSelectedSystemDesignCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {systemDesignCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {hasActiveSystemDesignFilters && (
              <button type="button" className="problem-browser-clear" onClick={clearSystemDesignFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div className="problem-browser-list">
            {Object.entries(groupedSystemDesign).map(([category, items]) => (
              <div key={category} className="problem-browser-group">
                <div className="problem-browser-group-header">{category}</div>
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="problem-browser-item problem-browser-item--system-design"
                    onClick={() => handleOpenSystemDesignTopic(t.id)}
                  >
                    <div className="problem-browser-item-main">
                      <span
                        className="problem-browser-diff"
                        style={{ color: DIFFICULTY_COLORS[t.difficulty] || "#eab308" }}
                      >
                        {(t.difficulty || "M")[0]}
                      </span>
                      <span className="problem-browser-item-title">{t.title}</span>
                      {t.source === "resume" && (
                        <span className="problem-browser-resume-badge">Resume</span>
                      )}
                      <span
                        className="problem-browser-practice-btn"
                        role="button"
                        tabIndex={0}
                        title="Start timed practice"
                        onClick={(e) => handlePromoteSystemDesign(e, t.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") handlePromoteSystemDesign(e as unknown as React.MouseEvent, t.id); }}
                      >
                        Practice
                      </span>
                    </div>
                    <div className="problem-browser-item-desc">{t.description}</div>
                    {t.relevance && (
                      <div className="problem-browser-item-relevance">{t.relevance}</div>
                    )}
                    {(t.keyConcepts ?? []).length > 0 && (
                      <div className="problem-browser-concepts">
                        {(t.keyConcepts ?? []).slice(0, 6).map((k) => (
                          <span key={k} className="problem-browser-concept-chip">{k}</span>
                        ))}
                        {(t.keyConcepts ?? []).length > 6 && (
                          <span className="problem-browser-concept-chip problem-browser-concept-more">
                            +{(t.keyConcepts ?? []).length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {filteredSystemDesign.length === 0 && (
              <div className="problem-browser-empty">No system design topics found</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
