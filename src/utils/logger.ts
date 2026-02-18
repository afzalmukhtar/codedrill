/**
 * Logger Utility
 *
 * Provides structured logging via VSCode's OutputChannel.
 * Supports log levels: DEBUG, INFO, WARN, ERROR.
 *
 * Logs are visible in: Output panel -> "CodeDrill"
 */

import * as vscode from "vscode";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

export class Logger {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  private format(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const levelLabel = LOG_LEVEL_LABELS[level];
    const argsStr = args.length > 0 ? " " + args.map((a) => JSON.stringify(a)).join(" ") : "";
    return `[${timestamp}] [${levelLabel}] ${message}${argsStr}`;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    const formatted = this.format(level, message, ...args);
    this.outputChannel.appendLine(formatted);
    if (process.env.NODE_ENV !== "production") {
      const consoleFn = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : console.log;
      consoleFn(formatted);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, error?: Error, ...args: unknown[]): void {
    const allArgs = error ? [error.message, ...args] : args;
    this.log(LogLevel.ERROR, message, ...allArgs);
    if (error?.stack) {
      this.outputChannel.appendLine(error.stack);
    }
  }
}
