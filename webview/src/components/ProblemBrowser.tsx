import React, { useEffect, useState, useCallback } from "react";
import { useVscode } from "../App";

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  pattern: string | null;
  hasDescription: boolean;
  attemptCount: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "#22c55e",
  Medium: "#eab308",
  Hard: "#ef4444",
};

interface ProblemBrowserProps {
  onClose: () => void;
}

export function ProblemBrowser({ onClose }: ProblemBrowserProps) {
  const { postMessage } = useVscode();
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "problemList") {
        setProblems(msg.problems as ProblemSummary[]);
      } else if (msg.type === "categoryList") {
        setCategories(msg.categories as string[]);
      }
    };
    window.addEventListener("message", handler);
    postMessage({ type: "getCategories" });
    postMessage({ type: "listProblems" });
    return () => window.removeEventListener("message", handler);
  }, [postMessage]);

  const handleCategoryChange = useCallback((cat: string) => {
    setSelectedCategory(cat);
    postMessage({ type: "listProblems", category: cat === "all" ? undefined : cat });
  }, [postMessage]);

  const handleOpen = useCallback((slug: string) => {
    postMessage({ type: "openProblem", slug });
    onClose();
  }, [postMessage, onClose]);

  const filtered = search
    ? problems.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : problems;

  const grouped = filtered.reduce<Record<string, ProblemSummary[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="problem-browser">
      <div className="problem-browser-header">
        <span className="problem-browser-title">Problems</span>
        <span className="problem-browser-count">{filtered.length}</span>
        <button type="button" className="problem-browser-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="problem-browser-filters">
        <input
          type="text"
          className="problem-browser-search"
          placeholder="Search problems..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="problem-browser-categories">
          <button
            type="button"
            className={`problem-browser-cat${selectedCategory === "all" ? " problem-browser-cat--active" : ""}`}
            onClick={() => handleCategoryChange("all")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`problem-browser-cat${selectedCategory === cat ? " problem-browser-cat--active" : ""}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
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
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="problem-browser-empty">No problems found</div>
        )}
      </div>
    </div>
  );
}
