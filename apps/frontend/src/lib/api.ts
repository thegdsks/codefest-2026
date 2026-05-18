import type { ApiResult, ApiErrorDetail } from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET

function buildAuthHeader(): string {
  const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`
  return `Basic ${btoa(credentials)}`
}

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const correlationId = generateCorrelationId()
  const method = (init?.method ?? 'GET').toUpperCase()

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(),
    'X-Correlation-Id': correlationId,
    ...(init?.headers as Record<string, string> | undefined),
  }

  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json'
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
    })

    const json = await response.json() as Record<string, unknown>

    if (!response.ok) {
      const errorPayload = json as { correlationId?: string; error?: ApiErrorDetail }
      return {
        data: null,
        error: errorPayload.error ?? {
          code: String(response.status),
          message: response.statusText,
        },
        correlationId: errorPayload.correlationId ?? correlationId,
      }
    }

    const successPayload = json as { correlationId?: string; data?: T }
    return {
      data: (successPayload.data ?? json) as T,
      error: null,
      correlationId: successPayload.correlationId ?? correlationId,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      },
      correlationId,
    }
  }
}
