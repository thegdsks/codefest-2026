import { clearSessionStorage } from './hotel/safe-storage';
import type { ApiErrorDetail, ApiResult } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET;

const DEDUPE_WINDOW_MS = 3000;

// Keyed by `${method}:${path}`. Cleared on successful response for the same key.
const errorBurstCache = new Map<
  string,
  { error: ApiErrorDetail; correlationId: string; expiresAt: number }
>();

function buildAuthHeader(): string {
  const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`;
  return `Basic ${btoa(credentials)}`;
}

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dispatchApiError(
  path: string,
  code: string,
  message: string,
  correlationId: string
): void {
  if (typeof globalThis.window === 'undefined') return;
  globalThis.dispatchEvent(
    new CustomEvent('sf:api-error', { detail: { path, code, message, correlationId } })
  );
}

function handleBurstError(
  cacheKey: string,
  path: string,
  error: ApiErrorDetail,
  correlationId: string
): { error: ApiErrorDetail; correlationId: string } {
  const cached = errorBurstCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Within dedupe window: return cached error silently, no new event.
    return { error: cached.error, correlationId: cached.correlationId };
  }
  errorBurstCache.set(cacheKey, { error, correlationId, expiresAt: Date.now() + DEDUPE_WINDOW_MS });
  dispatchApiError(path, error.code, error.message, correlationId);
  return { error, correlationId };
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function maybeExpireSession(status: number, init?: RequestInit): void {
  if (status !== 401 || typeof globalThis.window === 'undefined') return;
  const isBearerAuth = (
    init?.headers as Record<string, string> | undefined
  )?.Authorization?.startsWith('Bearer ');
  if (!isBearerAuth) return;
  clearSessionStorage('sf.session');
  globalThis.dispatchEvent(new CustomEvent('sf:session-expired'));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const correlationId = generateCorrelationId();
  const method = (init?.method ?? 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(),
    'X-Correlation-Id': correlationId,
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    // Non-JSON bodies (e.g. AWS Gateway 502/503 HTML) must not fall through to the network catch.
    const json = await parseJsonSafe(response);

    if (!response.ok) {
      maybeExpireSession(response.status, init);

      if (response.status >= 500) {
        const serverError: ApiErrorDetail = {
          code: 'SERVER_ERROR',
          message: 'The server is having trouble. Please try again in a moment.',
        };
        const burst = handleBurstError(cacheKey, path, serverError, correlationId);
        return { data: null, error: burst.error, correlationId: burst.correlationId };
      }

      const errorPayload = json as { correlationId?: string; error?: ApiErrorDetail };
      return {
        data: null,
        error: errorPayload.error ?? {
          code: String(response.status),
          message: response.statusText,
        },
        correlationId: errorPayload.correlationId ?? correlationId,
      };
    }

    // Successful response clears any burst suppression for this path.
    errorBurstCache.delete(cacheKey);

    const successPayload = json as { correlationId?: string; data?: T };
    return {
      data: (successPayload.data ?? json) as T,
      error: null,
      correlationId: successPayload.correlationId ?? correlationId,
    };
  } catch (err) {
    const networkError: ApiErrorDetail = {
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Network request failed',
    };
    const burst = handleBurstError(cacheKey, path, networkError, correlationId);
    return { data: null, error: burst.error, correlationId: burst.correlationId };
  }
}
