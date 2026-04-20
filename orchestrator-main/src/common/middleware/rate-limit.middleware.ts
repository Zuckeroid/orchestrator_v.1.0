type NextFunction = () => void;

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  connection?: {
    remoteAddress?: string;
  };
  originalUrl?: string;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  json(body: unknown): unknown;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  enabled: boolean;
  scope: string;
  windowMs: number;
  max: number;
  message: string;
  skip?: (request: RequestLike) => boolean;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const store = new Map<string, RateLimitState>();
  let requestsSinceCleanup = 0;

  return (request: RequestLike, response: ResponseLike, next: NextFunction) => {
    if (!options.enabled || options.max <= 0 || options.windowMs <= 0) {
      return next();
    }

    if (options.skip?.(request)) {
      return next();
    }

    const now = Date.now();
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 200) {
      requestsSinceCleanup = 0;
      pruneExpiredEntries(store, now);
    }

    const clientIp = resolveClientIp(request);
    const key = `${options.scope}:${clientIp}`;
    const existing = store.get(key);
    const state =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + options.windowMs,
          };

    state.count += 1;
    store.set(key, state);

    const remaining = Math.max(options.max - state.count, 0);
    response.setHeader('X-RateLimit-Limit', String(options.max));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count <= options.max) {
      return next();
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((state.resetAt - now) / 1000),
    );
    response.setHeader('Retry-After', String(retryAfterSeconds));

    return response.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: options.message,
      },
    });
  };
}

function pruneExpiredEntries(
  store: Map<string, RateLimitState>,
  now: number,
): void {
  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

function resolveClientIp(request: RequestLike): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim() ?? 'unknown';
  }

  return (
    request.ip ||
    request.socket?.remoteAddress ||
    request.connection?.remoteAddress ||
    'unknown'
  );
}
