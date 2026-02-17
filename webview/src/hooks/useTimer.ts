import { useState, useEffect, useCallback } from "react";
import { useVscode } from "../App";

type TimerPhase = "green" | "yellow" | "red";

export interface TimerState {
  remainingMs: number;
  totalMs: number;
  phase: TimerPhase;
  isRunning: boolean;
  isPaused: boolean;
  start: (durationMs: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * Timer Hook
 *
 * Listens for timerUpdate / timerExpired messages from the extension host.
 * Sends timerAction messages back for start / pause / resume / stop.
 */
export function useTimer(): TimerState {
  const { postMessage } = useVscode();
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [phase, setPhase] = useState<TimerPhase>("green");
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (!message) { return; }

      switch (message.type) {
        case "timerUpdate":
          setRemainingMs(message.remainingMs ?? 0);
          setTotalMs(message.totalMs ?? 0);
          setPhase((message.phase as TimerPhase) ?? "green");
          setIsRunning(message.isRunning ?? false);
          setIsPaused(message.isPaused ?? false);
          break;

        case "timerExpired":
          setRemainingMs(0);
          setIsRunning(false);
          setIsPaused(false);
          setPhase("red");
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

  const start = useCallback((durationMs: number) => {
    postMessage({ type: "timerAction", action: "start", durationMs });
    setTotalMs(durationMs);
    setRemainingMs(durationMs);
    setIsRunning(true);
    setIsPaused(false);
    setPhase("green");
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

  return {
    remainingMs,
    totalMs,
    phase,
    isRunning,
    isPaused,
    start,
    pause,
    resume,
    stop,
  };
}
