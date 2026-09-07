/**
 * Structured logging with mandatory redaction.
 *
 * Anything that looks like a secret, a token, a cookie or personal data is
 * stripped before it reaches stdout. Logs are JSON in production so Railway can
 * index them, and human-readable in development.
 */
import { getEnv } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values are replaced wholesale, at any depth. */
const REDACTED_KEYS = new Set(
  [
    'password',
    'newpassword',
    'currentpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'apikey',
    'api_key',
    'secret',
    'clientsecret',
    'client_secret',
    'authorization',
    'cookie',
    'setcookie',
    'set-cookie',
    'sessiontoken',
    'ciphertext',
    'authtag',
    'codeverifier',
    'signature',
    'stripe-signature',
    'email',
    'phone',
    'address',
    'ipaddress',
    'imageurl',
    'objectkey',
    'signedurl',
    'prompt',
    'systemprompt',
  ].map((k) => k.toLowerCase()),
);

const REDACTION = '[redacted]';
const MAX_STRING = 512;
const MAX_DEPTH = 6;

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTION : redactValue(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redact(context: Record<string, unknown>): Record<string, unknown> {
  return redactValue(context, 0) as Record<string, unknown>;
}

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (raw in LEVEL_ORDER) return raw as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function emit(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...redact(context),
  };

  let json = false;
  try {
    json = getEnv().isProduction;
  } catch {
    json = process.env.NODE_ENV === 'production';
  }

  const line = json ? JSON.stringify(payload) : `[${level}] ${message} ${formatContext(payload)}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function formatContext(payload: Record<string, unknown>): string {
  const { level: _l, time: _t, message: _m, ...rest } = payload;
  return Object.keys(rest).length ? JSON.stringify(rest) : '';
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function makeLogger(bindings: Record<string, unknown>): Logger {
  return {
    debug: (message, context) => emit('debug', message, { ...bindings, ...context }),
    info: (message, context) => emit('info', message, { ...bindings, ...context }),
    warn: (message, context) => emit('warn', message, { ...bindings, ...context }),
    error: (message, context) => emit('error', message, { ...bindings, ...context }),
    child: (extra) => makeLogger({ ...bindings, ...extra }),
  };
}

export const logger: Logger = makeLogger({});

/**
 * Reduces an unknown thrown value to a message safe to persist and show to an
 * operator. Never includes stack frames or nested cause payloads.
 */
export function sanitizeError(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500);
  }
  if (typeof error === 'string' && error.trim()) return error.slice(0, 500);
  return fallback;
}
