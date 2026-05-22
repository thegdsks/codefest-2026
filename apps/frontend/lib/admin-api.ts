import type { ApiErrorDetail, ApiResult } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET;

const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || 'basic').toLowerCase();
const BEARER_TOKEN_KEY = 'sf.adminBearerToken';

export type Window = '5m' | '1h' | '6h' | '24h' | '7d' | '30d';

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

export interface AiExplanation {
  paragraph: string;
  riskFactors: string[];
  recommendation: string;
}

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
  aiExplanation?: AiExplanation;
  // Per-type context fields for richer row labels
  location?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  amount?: number | null;
  recipientId?: string | null;
  velocity?: number | null;
  signal?: string | null;
  target?: string | null;
  ruleId?: string | null;
  mfaPath?: string | null;
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

export interface TraceCondition {
  field: string;
  operator: string;
  value: unknown;
  satisfied: boolean;
}

export interface DecisionTrace {
  ruleId: string | null;
  ruleName: string | null;
  engineLayer: 'L1' | 'L1+L2';
  latencyMs: number | null;
  matched: TraceCondition[];
  llmRationale: string | null;
}

export interface DecisionDetailResponse {
  decision: DecisionRow;
  auditTrail: AuditTrailStep[];
  trace: DecisionTrace | null;
}

export interface BudgetInfo {
  llmDailyUsd: number;
  usedUsd: number;
  remainingUsd: number;
  percentUsed: number;
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
  budget?: BudgetInfo;
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
  type?: 'CHALLENGE' | 'ACCESS';
  issuedAt?: number;
  createdAt?: number;
  expiresAt?: number;
  lastActivityAt?: number;
  mfaVerified?: boolean;
  mfaPath?: 'TOTP' | 'STATIC';
  source?: string;
  location?: string;
  ipAddress?: string;
  deviceId?: string;
  active?: boolean;
  revokedAt?: number;
  recordType?: string;
}

export interface SessionsListResponse {
  sessions: SessionRow[];
  count?: number;
}

export interface RiskRecentDecision {
  decisionId: string;
  decisionType: string;
  action: string;
  score: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
}

export interface UserRiskResponse {
  userId: string;
  riskScore: number;
  storedRiskScore?: number;
  isBlocked?: boolean;
  riskUpdatedAt?: number;
  asOf?: number;
  recentDecisions?: RiskRecentDecision[];
}

export interface MfaStatusResponse {
  total: number;
  enrolled: number;
  pending: number;
  notEnrolled: number;
  enrolledPercent: number;
}

export interface RiskRecentDecision {
  decisionId: string;
  decisionType: string;
  action: string;
  score: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
}

export interface UserRiskResponse {
  userId: string;
  riskScore: number;
  storedRiskScore?: number;
  isBlocked?: boolean;
  riskUpdatedAt?: number;
  asOf?: number;
  recentDecisions?: RiskRecentDecision[];
}

export interface MfaStatusResponse {
  total: number;
  enrolled: number;
  pending: number;
  notEnrolled: number;
  enrolledPercent: number;
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
  /** ISO timestamp cursor - only return decisions after this point */
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

export type ModelTier = 'budget' | 'standard' | 'premium';

export interface AiModel {
  id: string;
  displayName: string;
  family: 'anthropic' | 'google' | 'amazon' | 'meta' | 'cohere';
  tier: ModelTier;
  inputUsdPerM: number | null;
  outputUsdPerM: number | null;
  notes: string;
  recommended: boolean;
  classifyCostUsd: number | null;
  active: boolean;
}

export interface AiConfigResponse {
  proxyConfigured: boolean;
  activeModelId: string;
  activeModelKnown: boolean;
  defaultModelId: string;
  models: AiModel[];
}

export function getAiConfig(): Promise<ApiResult<AiConfigResponse>> {
  return adminFetch<AiConfigResponse>('/admin/ai-config');
}

export function getDecisions(q: DecisionsQuery): Promise<ApiResult<DecisionsListResponse>> {
  return adminFetch<DecisionsListResponse>(`/admin/decisions${decisionsQueryString(q)}`);
}

/**
 * listEngagementDecisions
 *
 * Convenience wrapper that pre-filters to ENGAGEMENT decision types.
 * The admin live engagement stream uses this so its query key is distinct
 * from the general decisions feed and can be paused independently.
 */
export function listEngagementDecisions(
  windowSec = 3600
): Promise<ApiResult<DecisionsListResponse>> {
  const windowLabel: Window =
    windowSec >= 30 * 86400 ? '30d' : windowSec >= 86400 ? '7d' : windowSec >= 21600 ? '6h' : '1h';
  return adminFetch<DecisionsListResponse>(
    `/admin/decisions?type=ENGAGEMENT&window=${windowLabel}&limit=50`
  );
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

export function getUserRisk(userId: string): Promise<ApiResult<UserRiskResponse>> {
  return adminFetch<UserRiskResponse>(`/admin/users/${encodeURIComponent(userId)}/risk`);
}

export function getMfaStatus(): Promise<ApiResult<MfaStatusResponse>> {
  return adminFetch<MfaStatusResponse>('/admin/mfa-status');
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

export interface ReseedResponse {
  ok: true;
  tablesReset: string[];
  itemsWritten: number;
  durationMs: number;
}

export interface DevConfigResponse {
  demoMode: boolean;
}

export function getDevConfig(): Promise<ApiResult<DevConfigResponse>> {
  return adminFetch<DevConfigResponse>('/admin/dev/config');
}

export function reseedDemo(): Promise<ApiResult<ReseedResponse>> {
  return adminFetch<ReseedResponse>('/admin/dev/reseed', { method: 'POST' });
}

export function setAdminBearerToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token === null) {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  } else {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
  }
}

// Activity feed types

export interface DecisionActivityEvent {
  kind: 'DECISION';
  timestamp: number;
  userId: string;
  summary: string;
  decisionId: string;
  engineLayer: string;
  raw: DecisionRow;
}

export interface SessionActivityEvent {
  kind: 'SESSION';
  timestamp: number;
  userId: string;
  summary: string;
  sessionId: string;
  raw: SessionRow;
}

export interface DemoActivityEvent {
  kind: 'DEMO_EVENT';
  timestamp: number;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface SignalActivityEvent {
  kind: 'SIGNAL';
  timestamp: number;
  userId: string;
  summary: string;
  signal: string;
  count: number;
  target: string;
  score: number;
  action: string;
  sessionId: string;
  raw: Record<string, unknown>;
}

export type ActivityEvent =
  | DecisionActivityEvent
  | SessionActivityEvent
  | DemoActivityEvent
  | SignalActivityEvent;

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  nextCursor: number;
}

export type DemoEventType =
  | 'USER_SWITCH'
  | 'LOCATION_OVERRIDE'
  | 'FORCE_HIGH_RISK'
  | 'SIGNAL_TRIGGER'
  | 'MFA_FORCED'
  | 'SURFACE_REEVALUATE';

export interface DemoEventPayload {
  from?: string;
  to?: string;
  location?: string;
  deviceId?: string;
  enabled?: boolean;
  signal?: string;
  target?: string;
}

export interface WriteDemoEventRequest {
  type: DemoEventType;
  actor?: string;
  payload?: DemoEventPayload;
  timestamp?: number;
}

export interface WriteDemoEventResponse {
  activityId: string;
  type: DemoEventType;
  actor: string;
  timestamp: number;
}

export function getActivityFeed(since?: number): Promise<ApiResult<ActivityFeedResponse>> {
  const qs = since ? `?since=${since}` : '';
  return adminFetch<ActivityFeedResponse>(`/admin/activity-feed${qs}`);
}

export function writeDemoEvent(
  req: WriteDemoEventRequest
): Promise<ApiResult<WriteDemoEventResponse>> {
  return adminFetch<WriteDemoEventResponse>('/admin/demo-events', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export interface ClearBlockResponse {
  cleared: boolean;
  userId: string;
  originalDecisionId?: string;
  releasedAt?: number;
  message?: string;
}

export function clearUserBlock(userId: string): Promise<ApiResult<ClearBlockResponse>> {
  return adminFetch<ClearBlockResponse>(`/admin/users/${encodeURIComponent(userId)}/clear-block`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export type SignalType =
  | 'rage_click'
  | 'dwell_no_action'
  | 'abandoned_flow_step'
  | 'repeated_query'
  | 'points_balance_stare';

export type SignalWindow = '1h' | '24h' | '7d' | '30d';

export interface SignalRow {
  activityId: string;
  userId: string;
  signal: string;
  target: string;
  activityTime: number;
  count: number;
  score: number;
  action: string;
  sessionId: string;
  ruleId: string | null;
  contextSummary: string;
  context: Record<string, unknown>;
  trustScore: number | null;
  scrollDepth: number | null;
}

export interface SignalsListResponse {
  signals: SignalRow[];
  count: number;
  window: SignalWindow;
}

export interface SignalsQuery {
  window?: SignalWindow;
  signal?: string;
  userId?: string;
  limit?: number;
}

export function getSignals(q: SignalsQuery = {}): Promise<ApiResult<SignalsListResponse>> {
  const params = new URLSearchParams();
  if (q.window) params.set('window', q.window);
  if (q.signal) params.set('signal', q.signal);
  if (q.userId) params.set('userId', q.userId);
  if (q.limit) params.set('limit', String(q.limit));
  const qs = params.toString();
  return adminFetch<SignalsListResponse>(`/admin/signals${qs ? `?${qs}` : ''}`);
}
