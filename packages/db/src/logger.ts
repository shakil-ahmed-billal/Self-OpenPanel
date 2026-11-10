// Duplicates @openpanel/core's `src/pino-logger.ts` on purpose: core depends
// on db, so db importing it would create a cycle.

import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger as PinoLogger } from 'pino';

export type ILogger = PinoLogger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';

// Exactly one shipping path at a time:
// - 'otlp': pino ships via the HyperDX transport (requires HYPERDX_API_KEY).
// - 'stdout': pino writes JSON to stdout; an external collector ships it.
const logExporter =
  process.env.LOG_EXPORTER ?? (process.env.HYPERDX_API_KEY ? 'otlp' : 'stdout');

// Substring match (lowercased). Catches camelCase, snake_case, prefixed and
// suffixed variants in one entry — e.g. 'token' covers accessToken,
// refresh_token, jwtToken, etc.
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'secret',
  'authorization',
  'apikey',
  'accesskey',
  'privatekey',
  'cookie',
  'bearer',
  'credential',
  'salt',
  'signature',
  'ip',
  'email',
  'firstname',
  'lastname',
  'surname',
];

const MAX_REDACT_DEPTH = 5;

function redactSensitive(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      ...value,
      message: value.message,
      stack: value.stack,
      name: value.name,
    };
  }
  if (
    depth >= MAX_REDACT_DEPTH ||
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEY_PATTERNS.some((k) => lowered.includes(k))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitive(val, depth + 1);
    }
  }
  return result;
}

// Shared by logs and traces so both signals land under the same service
// name in ClickStack (e.g. new-api-production).
function getServiceName(name: string): string {
  return [process.env.LOG_PREFIX, name, process.env.NODE_ENV ?? 'dev']
    .filter(Boolean)
    .join('-');
}

// Same Bun/pino-pretty incompatibility as the `isBun` guard in
// @openpanel/core's `src/pino-logger.ts`; keep in sync by hand.
const isBun = !!process.versions.bun;
const rawStdoutWrite = process.stdout.write.bind(process.stdout);

function formatGeneralLog(data: Record<string, unknown>): string {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const dim = '\x1b[90m';
  const name = String(data.name ?? 'db');
  const msg = String(data.msg ?? '');
  const level = Number(data.level ?? 30);

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  let levelTag = '\x1b[36m[INFO]\x1b[0m';
  if (level >= 50) {
    levelTag = `\x1b[31m${bold}[ERROR]\x1b[0m`;
  } else if (level >= 40) {
    levelTag = `\x1b[33m${bold}[WARN]\x1b[0m`;
  } else if (level <= 20) {
    levelTag = `${dim}[DEBUG]${reset}`;
  }

  let line = `${dim}[${timeStr}]${reset} ${levelTag} ${dim}(${name})${reset} ${msg}\n`;
  if (data.err && typeof data.err === 'object') {
    const err = data.err as { stack?: string; message?: string };
    if (err.stack) {
      line += `${err.stack}\n`;
    } else if (err.message) {
      line += `${err.message}\n`;
    }
  }
  return line;
}

function createDevStream() {
  return {
    write(chunk: string | Uint8Array) {
      const raw =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (
            parsed.level < 30 &&
            process.env.LOG_LEVEL !== 'debug' &&
            process.env.LOG_LEVEL !== 'trace'
          ) {
            continue;
          }
          rawStdoutWrite(formatGeneralLog(parsed));
        } catch {
          rawStdoutWrite(`${trimmed}\n`);
        }
      }
    },
  };
}

export function createLogger({ name }: { name: string }): ILogger {
  const service = getServiceName(name);

  const useHyperDX = logExporter === 'otlp' && !!process.env.HYPERDX_API_KEY;
  const usePretty =
    !(useHyperDX || isBun) && process.env.NODE_ENV !== 'production';
  const useDev =
    process.env.NODE_ENV !== 'production' &&
    !useHyperDX &&
    logExporter !== 'otlp' &&
    !usePretty;

  return pino(
    {
      name: service,
      level: logLevel,
      enabled: !silent,
      formatters: {
        log: (obj) => {
          return redactSensitive(obj) as Record<string, unknown>;
        },
      },
      // Keep trace_id/span_id on every line even in stdout mode so trace↔log
      // correlation survives when a collector does the shipping.
      mixin: process.env.HYPERDX_API_KEY
        ? HyperDX.getPinoMixinFunction
        : undefined,
      transport: useHyperDX
        ? HyperDX.getPinoTransport(logLevel, {
            detectResources: true,
            service,
          })
        : usePretty
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname,service',
              },
            }
          : undefined,
    },
    useDev ? (createDevStream() as never) : undefined
  );
}

export const logger = createLogger({ name: 'db:prisma' });
