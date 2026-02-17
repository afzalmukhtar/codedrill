import React from "react";
import { useTimer } from "../hooks/useTimer";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface TimerProps {
  timerDurationMs?: number;
}

/**
 * Minimal Countdown Timer
 *
 * Three states:
 * 1. Ready: shows suggested duration + "Start" button
 * 2. Running: shows countdown + pause/resume toggle + "End" button
 * 3. Hidden: no active problem / no timer
 */
export function Timer({ timerDurationMs }: TimerProps) {
  const { remainingMs, totalMs, phase, isRunning, isPaused, start, pause, resume, stop } = useTimer();

  // Not running and no duration to offer = hide completely
  if (!isRunning && !timerDurationMs) {
    return null;
  }

  // Ready state: timer not running but we have a suggested duration
  if (!isRunning && timerDurationMs && timerDurationMs > 0) {
    const mins = Math.round(timerDurationMs / 60000);
    return (
      <div className="timer timer--ready">
        <span className="timer-ready-label">{mins} min</span>
        <button
          type="button"
          className="timer-start-btn"
          onClick={() => start(timerDurationMs)}
        >
          Start Timer
        </button>
      </div>
    );
  }

  // Running state
  if (!isRunning) { return null; }

  const progress = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
  const isExpired = remainingMs <= 0;

  return (
    <div className={`timer timer--${phase}${isExpired ? " timer--expired" : ""}`}>
      <span className="timer-time">{formatTime(remainingMs)}</span>

      <div className="timer-progress-track">
        <div className="timer-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {!isExpired && (
        <button
          type="button"
          className="timer-btn"
          onClick={isPaused ? resume : pause}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? "\u25B6" : "\u23F8"}
        </button>
      )}

      <button
        type="button"
        className="timer-btn timer-btn--end"
        onClick={stop}
        title="End attempt"
      >
        End
      </button>
    </div>
  );
}
