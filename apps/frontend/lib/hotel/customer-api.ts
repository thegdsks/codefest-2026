import { apiFetch } from '@/lib/api';
import type { LoginContext } from '@/lib/hotel/demo-context';
import {
  getDemoLoginContext,
  getForceHighRiskTransfer,
  setForceHighRiskTransfer,
} from '@/lib/hotel/demo-context';
import type { SurfaceEligibilityResponse } from '@/lib/hotel/surface-types';
import type { ApiResult, DashboardResponse } from '@/lib/types';

export interface LoginSuccessData {
  status: 'SUCCESS';
  userId: string;
  sessionId: string;
  token: string;
  expiresAt: number;
}

export interface LoginMfaData {
  status: 'MFA_REQUIRED';
  reason: string;
  sessionId: string;
  mfa: { type: 'OTP'; expiresInSeconds: number };
}

export type LoginData = LoginSuccessData | LoginMfaData;

export interface MfaVerifyData {
  status: 'SUCCESS';
  message: string;
  mfaPath: 'TOTP' | 'STATIC';
  token: string;
  expiresAt: number;
}

export interface SessionData {
  userId: string;
  issuedAt: number;
  expiresAt: number;
  lastActivityAt: number;
  mfaVerified: boolean;
}

export interface TransferSuccessData {
  status: 'SUCCESS';
  transferId: string;
  message: string;
}

export interface TransferReviewData {
  status: 'UNDER_REVIEW';
  transferId: string;
  reason: string;
}

export interface TransferMfaChallenge {
  action: 'MFA';
  challengeId: string;
  mfaPath: 'TRANSFER_RISK';
  decisionId: string;
  expiresInSec: number;
}

export interface TransferMfaVerifyResponse {
  action: 'ALLOW';
  transferId: string;
  completedAt: number;
  mfaPath: 'TRANSFER_RISK';
}

export type TransferData = TransferSuccessData | TransferReviewData | TransferMfaChallenge;

// Stable demo context the prototype never collected. The backend records these
// in the activity log and feeds them to the login-risk engine.
const DEMO_LOCATION = 'New York';
const DEMO_DEVICE_ID = 'device-web-demo';
// Recipient that stands in for the loyalty partner in the user-to-user transfer model.
export const DEMO_RECIPIENT_ID = 'USER#002';

export interface LoginRequest {
  username: string;
  password: string;
  ctx?: LoginContext;
  forceMfa?: boolean;
}

/**
 * Submit a login request.
 *
 * Accepts either an options object (preferred) or the legacy positional
 * signature (username, password, ctx) for backward compatibility with
 * callers that have not yet been updated.
 */
export function login(
  usernameOrRequest: string | LoginRequest,
  legacyPassword?: string,
  legacyCtx?: LoginContext
): Promise<ApiResult<LoginData>> {
  let username: string;
  let password: string;
  let ctx: LoginContext | undefined;
  let forceMfa: boolean | undefined;

  if (typeof usernameOrRequest === 'string') {
    username = usernameOrRequest;
    password = legacyPassword ?? '';
    ctx = legacyCtx;
    forceMfa = undefined;
  } else {
    username = usernameOrRequest.username;
    password = usernameOrRequest.password;
    ctx = usernameOrRequest.ctx;
    forceMfa = usernameOrRequest.forceMfa;
  }

  const body: Record<string, unknown> = {
    username,
    password,
    location: ctx?.location ?? DEMO_LOCATION,
    deviceId: ctx?.deviceId ?? DEMO_DEVICE_ID,
    deviceType: ctx?.deviceType ?? 'desktop',
  };
  if (forceMfa === true) {
    body.forceMfa = true;
  }
  return apiFetch<LoginData>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function verifyMfa(sessionId: string, otp: string): Promise<ApiResult<MfaVerifyData>> {
  return apiFetch<MfaVerifyData>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ sessionId, otp }),
  });
}

export function logout(token: string): Promise<ApiResult<null>> {
  return apiFetch<null>('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// Login and MFA-verify both return a bearer token but no userId; resolve it
// from the session so the customer surface has a uniform handle on both paths.
export function fetchSession(token: string): Promise<ApiResult<SessionData>> {
  return apiFetch<SessionData>('/auth/session', { headers: bearer(token) });
}

/**
 * Submit a points transfer.
 *
 * Reads deviceFingerprint from the DemoPanel context (falls back to a
 * sessionStorage-persisted stable id). Reads forceHighRisk from the demo
 * context and clears it after reading so the flag only fires once.
 */
export function transferPoints(
  token: string,
  userId: string,
  amount: number
): Promise<ApiResult<TransferData>> {
  const ctx = getDemoLoginContext();

  // Stable per-browser fingerprint: use whatever the DemoPanel set, or fall
  // back to a value stored in sessionStorage so it stays consistent across
  // page navigations within a session.
  let deviceFingerprint = ctx.deviceId ?? DEMO_DEVICE_ID;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('sf_device_fp');
    if (!ctx.deviceId && stored) {
      deviceFingerprint = stored;
    } else if (!stored) {
      sessionStorage.setItem('sf_device_fp', deviceFingerprint);
    }
  }

  const forceHighRisk = getForceHighRiskTransfer();
  // Clear the flag immediately so it only affects this single transfer.
  setForceHighRiskTransfer(false);

  const body: Record<string, unknown> = {
    userId,
    recipientId: DEMO_RECIPIENT_ID,
    amount,
    channel: 'APP',
    deviceFingerprint,
  };
  if (forceHighRisk) {
    body.forceHighRisk = true;
  }

  return apiFetch<TransferData>('/transactions/transfer', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  });
}

/**
 * Complete a pending transfer MFA challenge.
 */
export function confirmTransferMfa(
  token: string,
  challengeId: string,
  otp: string
): Promise<ApiResult<TransferMfaVerifyResponse>> {
  return apiFetch<TransferMfaVerifyResponse>('/transactions/mfa/verify', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ challengeId, otp }),
  });
}

export function fetchDashboard(
  token: string,
  userId: string
): Promise<ApiResult<DashboardResponse>> {
  return apiFetch<DashboardResponse>(`/dashboard?userId=${encodeURIComponent(userId)}`, {
    headers: bearer(token),
  });
}

export interface EngagementSignalParams {
  count?: number;
  dwellMs?: number;
  stareMs?: number;
  [key: string]: number | string | boolean | undefined;
}

export interface EngagementEventResponse {
  surface: string | null;
  copy: string;
  reasonCode: string;
  engineLayer: string;
  score: number;
  action: string;
  decisionId: string | null;
}

/**
 * fetchSurfaceEligibility
 *
 * Calls GET /customer/surface-eligibility and returns the full response.
 * The hook wraps this with caching and per-session invalidation.
 * Pass aiMode=false to skip the LLM prioritizer layer and return only
 * deterministic surface evaluations.
 */
export function fetchSurfaceEligibility(
  token: string,
  userId: string,
  aiMode = true
): Promise<ApiResult<SurfaceEligibilityResponse>> {
  const modeParam = aiMode ? 'on' : 'off';
  return apiFetch<SurfaceEligibilityResponse>(
    `/customer/surface-eligibility?userId=${encodeURIComponent(userId)}&aiMode=${modeParam}`,
    { headers: bearer(token) }
  );
}

// ----------------------------------------------------------------------------
// Demo mutation
// ----------------------------------------------------------------------------

export interface UserMutation {
  profileCompletion?: number;
  tier?: 'Silver' | 'Gold' | 'Platinum';
  mfaEnrolled?: boolean;
  loyaltyScore?: number;
  flow?: { transfer?: { resume?: boolean; abandon?: boolean } };
  booking?: { trigger?: boolean };
}

export interface MutateUserResult {
  userId: string;
  touched: Record<string, { from: unknown; to: unknown }>;
  activityId: string;
  mutatedAt: number;
}

/**
 * mutateDemoUser
 *
 * Calls POST /admin/demo-actions/mutate-user via Basic Auth (apiFetch adds it
 * automatically). Returns the touched-fields snapshot so DemoPanel can echo
 * "tier: Gold -> Platinum" next to each button.
 */
export function mutateDemoUser(
  userId: string,
  mutation: UserMutation
): Promise<ApiResult<MutateUserResult>> {
  return apiFetch<MutateUserResult>('/admin/demo-actions/mutate-user', {
    method: 'POST',
    body: JSON.stringify({ userId, mutation }),
  });
}

/**
 * fireEngagementSignal
 *
 * Posts a synthetic engagement signal directly to the backend event endpoint.
 * Used by the Demo Panel to force a specific signal without waiting for the
 * SDK detectors to fire naturally.
 */
export function fireEngagementSignal(
  token: string,
  signal: string,
  userId: string,
  params: EngagementSignalParams = {}
): Promise<ApiResult<EngagementEventResponse>> {
  return apiFetch<EngagementEventResponse>('/engagement/event', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ signal, userId, sessionId: '', params }),
  });
}
