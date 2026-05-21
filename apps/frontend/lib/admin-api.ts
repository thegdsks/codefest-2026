import type { ApiErrorDetail, ApiResult } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET;

const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || 'basic').toLowerCase();
const BEARER_TOKEN_KEY = 'sf.adminBearerToken';

export type Window = '1h' | '24h' | '7d';

export type EngineLayer = 'L1' | 'L1+L2';

export type DecisionType =
  | 'FRAUD_LOGIN'
  | 'FRAUD_TRANSFER'
  | 'ENGAGEMENT_OFFER'
  | 'NUDGE'
  | 'PROFILE_COMPLETENESS'
  | 'MFA_VERIFY'
  | 'DECISION_RELEASE'
  | 'LOGIN'
  | 'TRANSFER'
  | 'OFFER';

export type DecisionAction =
  | 'ALLOW'
  | 'BLOCK'
  | 'MFA'
  | 'REVIEW'
  | 'OFFER'
  | 'NUDGE'
  | 'HOLD'
  | 'RELEASE';

export interface DecisionRow {
  decisionId: string;
  userId: string;
  decisionType: DecisionType | string;
  action: DecisionAction | string;
  score: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  engineLayer: EngineLayer;
  channel?: string;
  reasonCode?: string;
  reasonText?: string;
  reason?: string;
  explanation?: string;
  llmLatencyMs?: number;
  llmModel?: string;
  timestamp: number;
  isFinalDecision?: boolean;
  modelVersion?: string;
  originalDecisionId?: string;
  correlationId?: string;
}

export interface DecisionsListResponse {
  decisions: DecisionRow[];
  count: number;
}

export interface AuditTrailStep {
  step: string;
  score?: number;
  riskLevel?: string;
  action?: string;
  reasonCode?: string | null;
  llmModel?: string | null;
  llmLatencyMs?: number | null;
  label?: string;
}

export interface DecisionDetailResponse {
  decision: DecisionRow;
  auditTrail: AuditTrailStep[];
}

export interface MetricsResponse {
  totals: {
    total: number;
    l1: number;
    l1plus_l2: number;
    by_type: Record<string, number>;
    by_action: Record<string, number>;
  };
  costEstimateUsd: number;
  asOf: number;
  guard?: Record<string, unknown>;
}

export interface AdminUser {
  userId: string;
  username: string;
  tier?: string;
  loyaltyScore?: number;
  profileCompletion?: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  email?: string;
  points?: number;
}

export interface UsersListResponse {
  users: AdminUser[];
  nextCursor: string | null;
}

export interface ReleaseResponse {
  released: boolean;
  originalDecisionId: string;
  releasedAt: number;
}

export interface HealthResponse {
  status: 'ok' | string;
  uptime?: number;
  version?: string;
  [key: string]: unknown;
}

export interface SessionRow {
  sessionId: string;
  userId: string;
  issuedAt?: number;
  expiresAt?: number;
  lastActivityAt?: number;
}

export interface SessionsListResponse {
  sessions: SessionRow[];
}

function authHeader(): string {
  if (AUTH_MODE === 'bearer') {
    const token = typeof window !== 'undefined' ? localStorage.getItem(BEARER_TOKEN_KEY) : null;
    return `Bearer ${token ?? ''}`;
  }
  const credentials = `${CLIENT_ID ?? ''}:${CLIENT_SECRET ?? ''}`;
  return `Basic ${btoa(credentials)}`;
}

function correlationId(): string {
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const reqId = correlationId();
  const method = (init?.method ?? 'GET').toUpperCase();

  const headers: Record<string, string> = {
    Authorization: authHeader(),
    'X-Correlation-Id': reqId,
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const errorPayload = json as { correlationId?: string; error?: ApiErrorDetail };
      return {
        data: null,
        error: errorPayload.error ?? {
          code: String(response.status),
          message: response.statusText || 'Request failed',
        },
        correlationId: errorPayload.correlationId ?? reqId,
      };
    }

    const successPayload = json as { correlationId?: string; data?: T };
    return {
      data: (successPayload.data ?? json) as T,
      error: null,
      correlationId: successPayload.correlationId ?? reqId,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      },
      correlationId: reqId,
    };
  }
}

export interface DecisionsQuery {
  window?: Window;
  type?: string;
  userId?: string;
  limit?: number;
  /** ISO timestamp cursor — only return decisions after this point */
  since?: string;
}

function decisionsQueryString(q: DecisionsQuery): string {
  const params = new URLSearchParams();
  if (q.window) params.set('window', q.window);
  if (q.type) params.set('type', q.type);
  if (q.userId) params.set('userId', q.userId);
  if (q.limit) params.set('limit', String(q.limit));
  if (q.since) params.set('since', q.since);
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function getHealth(): Promise<ApiResult<HealthResponse>> {
  return adminFetch<HealthResponse>('/health');
}

export function getMetrics(window: Window = '24h'): Promise<ApiResult<MetricsResponse>> {
  return adminFetch<MetricsResponse>(`/admin/metrics?window=${window}`);
}

export function getDecisions(q: DecisionsQuery): Promise<ApiResult<DecisionsListResponse>> {
  return adminFetch<DecisionsListResponse>(`/admin/decisions${decisionsQueryString(q)}`);
}

export function getDecision(decisionId: string): Promise<ApiResult<DecisionDetailResponse>> {
  return adminFetch<DecisionDetailResponse>(`/admin/decisions/${encodeURIComponent(decisionId)}`);
}

export function exportDecisionsUrl(q: DecisionsQuery, format: 'csv' | 'json' = 'csv'): string {
  const params = new URLSearchParams();
  if (q.window) params.set('window', q.window);
  if (q.type) params.set('type', q.type);
  if (q.userId) params.set('userId', q.userId);
  params.set('format', format);
  return `${BASE_URL}/admin/decisions/export?${params.toString()}`;
}

export async function exportDecisionsCsv(q: DecisionsQuery): Promise<ApiResult<Blob>> {
  const reqId = correlationId();
  const url = exportDecisionsUrl(q, 'csv');
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(),
        'X-Correlation-Id': reqId,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      let errorDetail: { code: string; message: string } = {
        code: String(response.status),
        message: response.statusText || 'Export failed',
      };
      try {
        const json = JSON.parse(text) as { error?: { code: string; message: string } };
        if (json.error) errorDetail = json.error;
      } catch {
        // non-JSON error body, keep the default
      }
      return { data: null, error: errorDetail, correlationId: reqId };
    }
    return { data: await response.blob(), error: null, correlationId: reqId };
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      },
      correlationId: reqId,
    };
  }
}

export function releaseDecision(decisionId: string): Promise<ApiResult<ReleaseResponse>> {
  return adminFetch<ReleaseResponse>(`/admin/decisions/${encodeURIComponent(decisionId)}/release`, {
    method: 'POST',
  });
}

export interface UsersQuery {
  limit?: number;
  cursor?: string;
}

export function getUsers(q: UsersQuery = {}): Promise<ApiResult<UsersListResponse>> {
  const params = new URLSearchParams();
  if (q.limit) params.set('limit', String(q.limit));
  if (q.cursor) params.set('cursor', q.cursor);
  const qs = params.toString();
  return adminFetch<UsersListResponse>(`/admin/users${qs ? `?${qs}` : ''}`);
}

export function getUser(id: string): Promise<ApiResult<AdminUser>> {
  return adminFetch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`);
}

export function getSessions(): Promise<ApiResult<SessionsListResponse>> {
  return adminFetch<SessionsListResponse>('/admin/sessions');
}

export function revokeSession(sessionId: string): Promise<ApiResult<{ revoked: true }>> {
  return adminFetch<{ revoked: true }>(`/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: 'POST',
  });
}

export const adminApiConfig = {
  baseUrl: BASE_URL ?? '',
  clientId: CLIENT_ID ?? '',
  authMode: AUTH_MODE,
} as const;

export function setAdminBearerToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token === null) {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  } else {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
  }
}
