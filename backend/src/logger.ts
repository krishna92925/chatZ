import pino from 'pino';

export function createLogger(level = 'info', pretty = false) {
  return pino({
    level,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'access_token', 'refresh_token', 'token'],
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}
export type Logger = ReturnType<typeof createLogger>;
