import React, { useEffect, useCallback, useRef } from "react";
import { useTimer } from "../hooks/useTimer";

const ONE_MINUTE_MS = 60_000;
const MAX_DURATION_MS = 180 * ONE_MINUTE_MS;

function formatMinutes(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(totalSeconds / 60)).padStart(2, "0");
}

function formatSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return String(totalSeconds % 60).padStart(2, "0");
}

interface TimerProps {
  /** Suggested duration from problem difficulty (pre-fills the input). */
  timerDurationMs?: number;
}

/**
 * Countdown Timer
 *
 * Large rectangular display with user-adjustable duration.
 *
 * States:
 *   Idle     -- user sets time via +/- buttons, typing, or quick-add pills
 *   Running  -- big countdown display with Stop / Reset
 *   Paused   -- display frozen with Resume / Reset
 */
export function Timer({ timerDurationMs }: TimerProps) {
  const {
    remainingMs,
    isRunning,
    isPaused,
    durationMs,
    setDurationMs,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useTimer();

  const userDidReset = useRef(false);
  const lastSuggestion = useRef(timerDurationMs);

  // Pre-fill with the suggested duration when a new problem loads,
  // but skip if user explicitly reset the timer.
  useEffect(() => {
    if (timerDurationMs !== lastSuggestion.current) {
      userDidReset.current = false;
      lastSuggestion.current = timerDurationMs;
    }

    if (timerDurationMs && timerDurationMs > 0 && !isRunning && !userDidReset.current) {
      setDurationMs(timerDurationMs);
    }
  }, [timerDurationMs, isRunning, setDurationMs]);

  const addMinutes = useCallback(
    (mins: number) => {
      setDurationMs((prev: number) => Math.min(MAX_DURATION_MS, Math.max(0, prev + mins * ONE_MINUTE_MS)));
    },
    [setDurationMs],
  );

  const handleMinutesInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (Number.isNaN(val) || val < 0) {
        setDurationMs(0);
      } else {
        setDurationMs(Math.min(val, 180) * ONE_MINUTE_MS);
      }
    },
    [setDurationMs],
  );

  const handleStart = useCallback(() => {
    if (durationMs > 0) {
      userDidReset.current = false;
      start(durationMs);
    }
  }, [durationMs, start]);

  const handleReset = useCallback(() => {
    userDidReset.current = true;
    reset();
  }, [reset]);

  // ── Display values ──
  const displayMs = isRunning ? remainingMs : durationMs;
  const minutes = formatMinutes(displayMs);
  const seconds = formatSeconds(displayMs);
  const isExpired = isRunning && remainingMs <= 0;

  return (
    <div className="timer-container">
      {/* Large MM:SS display */}
      <div className="timer-display">
        {!isRunning ? (
          <>
            <button
              type="button"
              className="timer-adjust-btn"
              onClick={() => addMinutes(-1)}
              disabled={durationMs <= 0}
              title="Subtract 1 minute"
              aria-label="Subtract 1 minute"
            >
              &minus;
            </button>
            <input
              type="number"
              className="timer-minutes-input"
              value={Math.floor(durationMs / ONE_MINUTE_MS)}
              onChange={handleMinutesInput}
              min={0}
              max={180}
              aria-label="Minutes"
            />
            <span className="timer-colon">:</span>
            <span className="timer-seconds">00</span>
            <button
              type="button"
              className="timer-adjust-btn"
              onClick={() => addMinutes(1)}
              disabled={durationMs >= MAX_DURATION_MS}
              title="Add 1 minute"
              aria-label="Add 1 minute"
            >
              +
            </button>
          </>
        ) : (
          <>
            <span className={`timer-digits${isExpired ? " timer-digits--expired" : ""}`}>
              {minutes}
            </span>
            <span className={`timer-colon${isExpired ? " timer-digits--expired" : ""}`}>:</span>
            <span className={`timer-digits${isExpired ? " timer-digits--expired" : ""}`}>
              {seconds}
            </span>
          </>
        )}
      </div>

      {/* Quick-add pills (idle only) */}
      {!isRunning && (
        <div className="timer-quick-btns">
          <button type="button" className="timer-pill" onClick={() => addMinutes(15)}>+15 min</button>
          <button type="button" className="timer-pill" onClick={() => addMinutes(10)}>+10 min</button>
          <button type="button" className="timer-pill" onClick={() => addMinutes(5)}>+5 min</button>
          <button type="button" className="timer-pill" onClick={() => addMinutes(1)}>+1 min</button>
        </div>
      )}

      {/* Controls */}
      <div className="timer-controls">
        {!isRunning && (
          <>
            <button
              type="button"
              className="timer-ctrl timer-ctrl--start"
              onClick={handleStart}
              disabled={durationMs <= 0}
            >
              Start
            </button>
            <button
              type="button"
              className="timer-ctrl timer-ctrl--reset"
              onClick={handleReset}
              disabled={durationMs <= 0}
            >
              Reset
            </button>
          </>
        )}

        {isRunning && !isPaused && !isExpired && (
          <>
            <button type="button" className="timer-ctrl timer-ctrl--stop" onClick={pause}>
              Pause
            </button>
            <button type="button" className="timer-ctrl timer-ctrl--stop" onClick={stop}>
              Stop
            </button>
            <button type="button" className="timer-ctrl timer-ctrl--reset" onClick={handleReset}>
              Reset
            </button>
          </>
        )}

        {isRunning && isPaused && (
          <>
            <button type="button" className="timer-ctrl timer-ctrl--start" onClick={resume}>
              Resume
            </button>
            <button type="button" className="timer-ctrl timer-ctrl--stop" onClick={stop}>
              Stop
            </button>
            <button type="button" className="timer-ctrl timer-ctrl--reset" onClick={handleReset}>
              Reset
            </button>
          </>
        )}

        {isExpired && !isPaused && (
          <button type="button" className="timer-ctrl timer-ctrl--reset" onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
