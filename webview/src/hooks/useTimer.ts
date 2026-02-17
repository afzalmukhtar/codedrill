import { useState, useEffect, useCallback } from "react";
import { useVscode } from "../App";

export interface TimerState {
  /** Milliseconds remaining on the countdown (0 when idle). */
  remainingMs: number;
  /** Total duration the timer was started with. */
  totalMs: number;
  /** Whether the countdown is actively running. */
  isRunning: boolean;
  /** Whether the running timer is paused. */
  isPaused: boolean;

  /**
   * The user-chosen duration in ms (set before starting).
   * This is the value the UI edits with +/- and quick-add.
   */
  durationMs: number;
  setDurationMs: (ms: number) => void;

  start: (durationMs: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Timer Hook
 *
 * Listens for timerUpdate / timerExpired / timerStopped messages from the
 * extension host. Sends timerAction messages back for start / pause /
 * resume / stop / reset.
 *
 * Also exposes `durationMs` / `setDurationMs` so the Timer component can
 * let the user choose a duration before pressing Start.
 */
export function useTimer(): TimerState {
  const { postMessage } = useVscode();
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (!message) { return; }

      switch (message.type) {
        case "timerUpdate":
          setRemainingMs(message.remainingMs ?? 0);
          setTotalMs(message.totalMs ?? 0);
          setIsRunning(message.isRunning ?? false);
          setIsPaused(message.isPaused ?? false);
          break;

        case "timerExpired":
          setRemainingMs(0);
          setIsRunning(false);
          setIsPaused(false);
          break;

        case "timerStopped":
          setIsRunning(false);
          setIsPaused(false);
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const start = useCallback((ms: number) => {
    postMessage({ type: "timerAction", action: "start", durationMs: ms });
    setTotalMs(ms);
    setRemainingMs(ms);
    setIsRunning(true);
    setIsPaused(false);
  }, [postMessage]);

  const pause = useCallback(() => {
    postMessage({ type: "timerAction", action: "pause" });
    setIsPaused(true);
  }, [postMessage]);

  const resume = useCallback(() => {
    postMessage({ type: "timerAction", action: "resume" });
    setIsPaused(false);
  }, [postMessage]);

  const stop = useCallback(() => {
    postMessage({ type: "timerAction", action: "stop" });
    setIsRunning(false);
    setIsPaused(false);
  }, [postMessage]);

  const reset = useCallback(() => {
    postMessage({ type: "timerAction", action: "reset" });
    setRemainingMs(0);
    setTotalMs(0);
    setIsRunning(false);
    setIsPaused(false);
    setDurationMs(0);
  }, [postMessage]);

  return {
    remainingMs,
    totalMs,
    isRunning,
    isPaused,
    durationMs,
    setDurationMs,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
