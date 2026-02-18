import React, { useEffect, useState } from "react";
import { useVscode } from "../App";

interface CategoryStat {
  category: string;
  total: number;
  attempted: number;
  solved: number;
}

interface PatternStat {
  pattern: string;
  total: number;
  solved: number;
}

interface DueReview {
  title: string;
  difficulty: string;
  category: string;
  due: string;
}

export interface DashboardData {
  totalSolved: number;
  totalProblems: number;
  streakDays: number;
  dueCount: number;
  categoryStats: CategoryStat[];
  patternStats: PatternStat[];
  dueReviews: DueReview[];
}

interface DashboardProps {
  onClose: () => void;
}

export function Dashboard({ onClose }: DashboardProps) {
  const { postMessage } = useVscode();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === "dashboardData") {
        setData(event.data.data as DashboardData);
      }
    };
    window.addEventListener("message", handler);
    postMessage({ type: "getDashboard" });
    return () => window.removeEventListener("message", handler);
  }, [postMessage]);

  if (!data) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <span className="dashboard-title">Dashboard</span>
          <button type="button" className="dashboard-close" onClick={onClose}>x</button>
        </div>
        <div className="dashboard-loading">Loading stats...</div>
      </div>
    );
  }

  const solvedPct = data.totalProblems > 0
    ? Math.round((data.totalSolved / data.totalProblems) * 100)
    : 0;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <span className="dashboard-title">Dashboard</span>
        <button type="button" className="dashboard-close" onClick={onClose}>x</button>
      </div>

      <div className="dashboard-stats-row">
        <div className="dashboard-stat">
          <span className="dashboard-stat-value dashboard-streak">{data.streakDays}</span>
          <span className="dashboard-stat-label">day streak</span>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-value">{data.totalSolved}</span>
          <span className="dashboard-stat-label">solved</span>
        </div>
        <div className="dashboard-stat">
          <span className="dashboard-stat-value">{data.dueCount}</span>
          <span className="dashboard-stat-label">due</span>
        </div>
      </div>

      <div className="dashboard-progress-ring">
        <span className="dashboard-pct">{solvedPct}%</span>
        <span className="dashboard-pct-label">{data.totalSolved}/{data.totalProblems}</span>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-title">Category Progress</div>
        {data.categoryStats.length === 0 ? (
          <div className="dashboard-empty">No problems loaded yet</div>
        ) : (
          data.categoryStats.map((cat) => {
            const pct = cat.total > 0 ? Math.round((cat.solved / cat.total) * 100) : 0;
            return (
              <div key={cat.category} className="dashboard-cat">
                <div className="dashboard-cat-header">
                  <span className="dashboard-cat-name">{cat.category}</span>
                  <span className="dashboard-cat-count">{cat.solved}/{cat.total}</span>
                </div>
                <div className="dashboard-bar">
                  <div className="dashboard-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {data.patternStats.length > 0 && (
        <div className="dashboard-section">
          <div className="dashboard-section-title">Pattern Mastery</div>
          {data.patternStats.map((ps) => {
            const pct = ps.total > 0 ? Math.round((ps.solved / ps.total) * 100) : 0;
            return (
              <div key={ps.pattern} className="dashboard-cat">
                <div className="dashboard-cat-header">
                  <span className="dashboard-cat-name">{ps.pattern}</span>
                  <span className="dashboard-cat-count">{ps.solved}/{ps.total}</span>
                </div>
                <div className="dashboard-bar">
                  <div className="dashboard-bar-fill dashboard-bar-fill--pattern" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.dueReviews.length > 0 && (
        <div className="dashboard-section">
          <div className="dashboard-section-title">Upcoming Reviews</div>
          {data.dueReviews.map((review, i) => (
            <div key={`${review.title}-${i}`} className="dashboard-review-item">
              <span className="dashboard-review-title">{review.title}</span>
              <span className={`dashboard-review-diff dashboard-diff--${review.difficulty.toLowerCase()}`}>
                {review.difficulty[0]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
