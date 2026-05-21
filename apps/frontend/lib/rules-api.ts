import type { ApiResult } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET;

const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || 'basic').toLowerCase();
const BEARER_TOKEN_KEY = 'sf.adminBearerToken';

export type RuleStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export type SurfaceType = 'banner' | 'modal' | 'tooltip';

export type ActionType = 'HINT' | 'NUDGE' | 'OFFER' | 'CUSTOM';

export interface RuleCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface RuleConditionGroup {
  combinator: 'and' | 'or';
  rules: Array<RuleCondition | RuleConditionGroup>;
}

export interface RuleAction {
  surface: SurfaceType;
  useAI: boolean;
  fallbackCopy: string;
  maxPerUserPerDay: number;
  actionType?: ActionType;
  score?: number;
}

export interface SampleMatch {
  decisionId: string;
  signal: string;
  userId: string;
  timestamp: string;
}

export interface RuleTestResult {
  count: number;
  samples: SampleMatch[];
}

export interface AiSuggestResult {
  name: string;
  conditions: RuleConditionGroup;
  event?: string;
  explanation: string;
}

export interface EngagementRule {
  ruleId: string;
  name: string;
  status: RuleStatus;
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  action: RuleAction;
  firesLast24h: number;
  updatedAt: number;
  createdAt: number;
}

export interface RulesListResponse {
  rules: EngagementRule[];
  count: number;
}

export interface RulesFilter {
  status?: RuleStatus;
}

export interface CreateRulePayload {
  name: string;
  status: RuleStatus;
  /** Backend json-rules-engine shape. Generated from form state via toDefinition(). */
  definition: Record<string, unknown>;
  /** Frontend display state. Kept for the live preview and disclaimers. NOT sent to the API. */
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  action: RuleAction;
}
export type UpdateRulePayload = Partial<CreateRulePayload>;

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

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const errorPayload = json as {
        correlationId?: string;
        error?: { code: string; message: string };
      };
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

export function getRules(filter?: RulesFilter): Promise<ApiResult<RulesListResponse>> {
  const params = new URLSearchParams();
  if (filter?.status) params.set('status', filter.status);
  const qs = params.toString();
  return adminFetch<RulesListResponse>(`/admin/rules${qs ? `?${qs}` : ''}`);
}

export function getRule(id: string): Promise<ApiResult<EngagementRule>> {
  return adminFetch<EngagementRule>(`/admin/rules/${encodeURIComponent(id)}`);
}

export function createRule(rule: CreateRulePayload): Promise<ApiResult<EngagementRule>> {
  // Strip frontend-only display fields before sending. Backend expects
  // { name, status, definition }; legacy whenConditions/whoConditions/action
  // would be persisted into DDB if forwarded.
  const body = { name: rule.name, status: rule.status, definition: rule.definition };
  return adminFetch<EngagementRule>('/admin/rules', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateRule(
  id: string,
  rule: UpdateRulePayload
): Promise<ApiResult<EngagementRule>> {
  return adminFetch<EngagementRule>(`/admin/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(rule),
  });
}

export function archiveRule(id: string): Promise<ApiResult<EngagementRule>> {
  return adminFetch<EngagementRule>(`/admin/rules/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  });
}

export function aiSuggest(description: string): Promise<ApiResult<AiSuggestResult>> {
  return adminFetch<AiSuggestResult>('/admin/rules/ai-suggest', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export function testRule(
  definition: Record<string, unknown>,
  windowSec?: number
): Promise<ApiResult<RuleTestResult>> {
  const body: Record<string, unknown> = { definition };
  if (typeof windowSec === 'number') body.windowSec = windowSec;
  return adminFetch<RuleTestResult>('/admin/rules/test', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
