export type TimerPhase = "green" | "yellow" | "red";

export interface TimerResult {
  elapsedMs: number;
  wasExpired: boolean;
}

export interface Disposable {
  dispose(): void;
}

const TICK_INTERVAL_MS = 1000;
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Countdown Timer
 *
 * Runs in the extension host (survives webview recreation).
 * Emits tick, warning (5 min remaining), and expired events.
 *
 * Color phases:
 *   green  -- >50% remaining
 *   yellow -- 25-50% remaining
 *   red    -- <25% remaining
 */
export class Timer {
  private _durationMs = 0;
  private _startTime = 0;
  private _pausedAt = 0;
  private _totalPausedMs = 0;
  private _isRunning = false;
  private _isPaused = false;
  private _hasExpired = false;
  private _warningSent = false;
  private _intervalId: ReturnType<typeof setInterval> | null = null;

  private _tickCallbacks: Array<(remainingMs: number, phase: TimerPhase) => void> = [];
  private _warningCallbacks: Array<(remainingMs: number) => void> = [];
  private _expiredCallbacks: Array<() => void> = [];

  get isRunning(): boolean { return this._isRunning; }
  get isPaused(): boolean { return this._isPaused; }
  get durationMs(): number { return this._durationMs; }

  start(durationMs: number): void {
    this.stop();
    this._durationMs = durationMs;
    this._startTime = Date.now();
    this._totalPausedMs = 0;
    this._pausedAt = 0;
    this._isRunning = true;
    this._isPaused = false;
    this._hasExpired = false;
    this._warningSent = false;

    this._intervalId = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    this._tick();
  }

  pause(): void {
    if (!this._isRunning || this._isPaused) { return; }
    this._isPaused = true;
    this._pausedAt = Date.now();
  }

  resume(): void {
    if (!this._isRunning || !this._isPaused) { return; }
    this._totalPausedMs += Date.now() - this._pausedAt;
    this._pausedAt = 0;
    this._isPaused = false;
  }

  stop(): TimerResult {
    const elapsed = this.getElapsedMs();
    const wasExpired = this._hasExpired;

    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._isRunning = false;
    this._isPaused = false;

    return { elapsedMs: elapsed, wasExpired };
  }

  getElapsedMs(): number {
    if (!this._isRunning) { return 0; }
    const now = this._isPaused ? this._pausedAt : Date.now();
    return now - this._startTime - this._totalPausedMs;
  }

  getRemainingMs(): number {
    if (!this._isRunning) { return 0; }
    return Math.max(0, this._durationMs - this.getElapsedMs());
  }

  getPhase(): TimerPhase {
    if (this._durationMs === 0) { return "green"; }
    const ratio = this.getRemainingMs() / this._durationMs;
    if (ratio > 0.5) { return "green"; }
    if (ratio > 0.25) { return "yellow"; }
    return "red";
  }

  onTick(callback: (remainingMs: number, phase: TimerPhase) => void): Disposable {
    this._tickCallbacks.push(callback);
    return { dispose: () => { this._tickCallbacks = this._tickCallbacks.filter((c) => c !== callback); } };
  }

  onWarning(callback: (remainingMs: number) => void): Disposable {
    this._warningCallbacks.push(callback);
    return { dispose: () => { this._warningCallbacks = this._warningCallbacks.filter((c) => c !== callback); } };
  }

  onExpired(callback: () => void): Disposable {
    this._expiredCallbacks.push(callback);
    return { dispose: () => { this._expiredCallbacks = this._expiredCallbacks.filter((c) => c !== callback); } };
  }

  private _tick(): void {
    if (this._isPaused || !this._isRunning) { return; }

    const remaining = this.getRemainingMs();
    const phase = this.getPhase();

    for (const cb of this._tickCallbacks) {
      cb(remaining, phase);
    }

    if (!this._warningSent && remaining > 0 && remaining <= WARNING_THRESHOLD_MS) {
      this._warningSent = true;
      for (const cb of this._warningCallbacks) {
        cb(remaining);
      }
    }

    if (remaining <= 0 && !this._hasExpired) {
      this._hasExpired = true;
      for (const cb of this._expiredCallbacks) {
        cb();
      }
      this.stop();
    }
  }
}
