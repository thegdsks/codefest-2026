import { apiFetch } from '@/lib/api';
import type { LoginContext } from '@/lib/hotel/demo-context';
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

export type TransferData = TransferSuccessData | TransferReviewData;

// Stable demo context the prototype never collected. The backend records these
// in the activity log and feeds them to the login-risk engine.
const DEMO_LOCATION = 'New York';
const DEMO_DEVICE_ID = 'device-web-demo';
// Recipient that stands in for the loyalty partner in the user-to-user transfer model.
export const DEMO_RECIPIENT_ID = 'USER#002';

export function login(
  username: string,
  password: string,
  ctx?: LoginContext
): Promise<ApiResult<LoginData>> {
  return apiFetch<LoginData>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      location: ctx?.location ?? DEMO_LOCATION,
      deviceId: ctx?.deviceId ?? DEMO_DEVICE_ID,
      deviceType: ctx?.deviceType ?? 'desktop',
    }),
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

export function transferPoints(
  token: string,
  userId: string,
  amount: number
): Promise<ApiResult<TransferData>> {
  return apiFetch<TransferData>('/transactions/transfer', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ userId, recipientId: DEMO_RECIPIENT_ID, amount, channel: 'APP' }),
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
