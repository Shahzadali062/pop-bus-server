type LogLevel = "debug" | "info" | "warn" | "error";

function formatMessage(level: LogLevel, scope: string, message: string) {
  return `[${level.toUpperCase()}] [${scope}] ${message}`;
}

export const logger = {
  debug(scope: string, message: string, data?: unknown) {
    if (process.env.NODE_ENV === "production") return;

    if (data !== undefined) {
      console.log(formatMessage("debug", scope, message), data);
      return;
    }

    console.log(formatMessage("debug", scope, message));
  },

  info(scope: string, message: string, data?: unknown) {
    if (data !== undefined) {
      console.log(formatMessage("info", scope, message), data);
      return;
    }

    console.log(formatMessage("info", scope, message));
  },

  warn(scope: string, message: string, data?: unknown) {
    if (data !== undefined) {
      console.warn(formatMessage("warn", scope, message), data);
      return;
    }

    console.warn(formatMessage("warn", scope, message));
  },

  error(scope: string, message: string, data?: unknown) {
    if (data !== undefined) {
      console.error(formatMessage("error", scope, message), data);
      return;
    }

    console.error(formatMessage("error", scope, message));
  },
};
