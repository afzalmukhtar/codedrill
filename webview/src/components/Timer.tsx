import React from "react";
import { useTimer } from "../hooks/useTimer";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Visual Countdown Timer
 *
 * Displays a countdown timer with color transitions:
 * - Green: >50% remaining
 * - Yellow: 25-50% remaining
 * - Red: <25% remaining
 *
 * Features: MM:SS display, progress bar, pause/resume button, phase colors
 */
export function Timer() {
  const { remainingMs, totalMs, phase, isRunning, isPaused, pause, resume, stop } = useTimer();

  if (!isRunning && remainingMs <= 0) {
    return null;
  }

  const progress = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
  const isExpired = isRunning && remainingMs <= 0;

  return (
    <div className={`timer timer--${phase}${isExpired ? " timer--expired" : ""}`}>
      <div className="timer-display">
        <span className="timer-time">{formatTime(remainingMs)}</span>
        {isPaused && <span className="timer-paused-label">PAUSED</span>}
      </div>

      <div className="timer-progress-track">
        <div
          className="timer-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="timer-controls">
        {isRunning && !isPaused && (
          <button className="timer-btn timer-btn--pause" onClick={pause} title="Pause timer">
            &#10074;&#10074;
          </button>
        )}
        {isRunning && isPaused && (
          <button className="timer-btn timer-btn--resume" onClick={resume} title="Resume timer">
            &#9654;
          </button>
        )}
        {isRunning && (
          <button className="timer-btn timer-btn--stop" onClick={stop} title="Stop timer">
            &#9632;
          </button>
        )}
      </div>
    </div>
  );
}
