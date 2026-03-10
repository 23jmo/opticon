// Structured logger with issue/session context

export interface LogContext {
  issue_id?: string;
  identifier?: string;
  session_id?: string;
  component?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatContext(ctx?: LogContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.component) parts.push(`[${ctx.component}]`);
  if (ctx.identifier) parts.push(`[${ctx.identifier}]`);
  else if (ctx.issue_id) parts.push(`[${ctx.issue_id}]`);
  if (ctx.session_id) parts.push(`[session:${ctx.session_id.slice(0, 8)}]`);
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

function log(level: LogLevel, message: string, ctx?: LogContext, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[globalLevel]) return;

  const prefix = `${formatTimestamp()} ${level.toUpperCase().padEnd(5)}${formatContext(ctx)}`;
  const line = `${prefix} ${message}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function createLogger(component: string) {
  const baseCtx: LogContext = { component };

  return {
    debug(msg: string, ctx?: LogContext, data?: unknown) {
      log("debug", msg, { ...baseCtx, ...ctx }, data);
    },
    info(msg: string, ctx?: LogContext, data?: unknown) {
      log("info", msg, { ...baseCtx, ...ctx }, data);
    },
    warn(msg: string, ctx?: LogContext, data?: unknown) {
      log("warn", msg, { ...baseCtx, ...ctx }, data);
    },
    error(msg: string, ctx?: LogContext, data?: unknown) {
      log("error", msg, { ...baseCtx, ...ctx }, data);
    },
    child(issueCtx: LogContext) {
      return {
        debug(msg: string, data?: unknown) {
          log("debug", msg, { ...baseCtx, ...issueCtx }, data);
        },
        info(msg: string, data?: unknown) {
          log("info", msg, { ...baseCtx, ...issueCtx }, data);
        },
        warn(msg: string, data?: unknown) {
          log("warn", msg, { ...baseCtx, ...issueCtx }, data);
        },
        error(msg: string, data?: unknown) {
          log("error", msg, { ...baseCtx, ...issueCtx }, data);
        },
      };
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
export type ChildLogger = ReturnType<Logger["child"]>;
