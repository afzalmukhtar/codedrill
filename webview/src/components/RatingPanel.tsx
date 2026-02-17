import React from "react";
import { useVscode } from "../App";

const RATINGS = [
  { value: 1 as const, label: "Again", desc: "Couldn't solve it", color: "#ef4444" },
  { value: 2 as const, label: "Hard", desc: "Solved with struggle", color: "#eab308" },
  { value: 3 as const, label: "Good", desc: "Solved with effort", color: "#22c55e" },
  { value: 4 as const, label: "Easy", desc: "Solved quickly", color: "#3b82f6" },
];

interface RatingPanelProps {
  onRated: () => void;
  gaveUp?: boolean;
}

/**
 * Rating Panel
 *
 * Shown after a practice session ends (timer expires, user stops, or gives up).
 * Collects an FSRS rating (1-4) to update the spaced repetition card.
 */
export function RatingPanel({ onRated, gaveUp }: RatingPanelProps) {
  const { postMessage } = useVscode();

  const handleRate = (rating: 1 | 2 | 3 | 4) => {
    postMessage({ type: "rateAttempt", rating, gaveUp: gaveUp ?? false });
    onRated();
  };

  return (
    <div className="rating-panel">
      <div className="rating-header">
        {gaveUp
          ? "No worries — rate how well you understood the problem:"
          : "How did that go? Rate your attempt:"}
      </div>
      <div className="rating-buttons">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`rating-btn rating-btn--${r.value}`}
            onClick={() => handleRate(r.value)}
            title={r.desc}
          >
            <span className="rating-btn-label">{r.label}</span>
            <span className="rating-btn-desc">{r.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
