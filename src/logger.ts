export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [claude-code-acp] ${message}\n`;
}

export const logger = {
  debug(message: string): void {
    if (shouldLog("debug")) {
      process.stderr.write(formatMessage("debug", message));
    }
  },
  info(message: string): void {
    if (shouldLog("info")) {
      process.stderr.write(formatMessage("info", message));
    }
  },
  warn(message: string): void {
    if (shouldLog("warn")) {
      process.stderr.write(formatMessage("warn", message));
    }
  },
  error(message: string): void {
    if (shouldLog("error")) {
      process.stderr.write(formatMessage("error", message));
    }
  },
};
