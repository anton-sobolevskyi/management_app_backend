import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';
import { generateRequestId } from '../common/utils/token-hash';

/** Client-supplied ids are only trusted when short and log-safe. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Probes would drown the access log. */
const QUIET_PATHS = new Set(['/', '/health']);

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : generateRequestId();
}

/**
 * Structured JSON logging (pino). Every log line written during a request —
 * including the ones from the exception filter and services — carries the
 * request id, so one id traces a request end to end.
 */
export function getLoggerParams(env: NodeJS.ProcessEnv = process.env): Params {
  const level =
    env.NODE_ENV === 'test'
      ? 'silent'
      : env.LOG_LEVEL?.trim() ||
        (env.NODE_ENV === 'production' ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = resolveRequestId(req.headers['x-request-id']);
        // Same contract as RequestIdMiddleware, whichever runs first
        req.headers['x-request-id'] = id;
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Never write credentials to the logs
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          QUIET_PATHS.has((req.url ?? '').split('?')[0]),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
