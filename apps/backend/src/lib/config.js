'use strict';

/**
 * Central config object. All properties use getters so process.env is read
 * fresh on each access. This matters for tests that mutate process.env and
 * re-require the handler module without clearing the lib module cache.
 */
const CFG = {
  get clientId() {
    return process.env.CLIENT_ID || 'demoClient';
  },
  get clientSecret() {
    return process.env.CLIENT_SECRET || 'demoSecret';
  },
  get mfaOtp() {
    return process.env.MFA_OTP || '123456';
  },
  // 'totp' (default) accepts only valid TOTP codes from an authenticator app.
  // 'static' additionally accepts the legacy demo OTP, for the judges-have-
  // no-phone fallback. 'static-only' rejects TOTP entirely (legacy demo mode).
  get mfaMode() {
    return process.env.MFA_MODE || 'totp';
  },
  get sessionTtlSec() {
    return Number(process.env.SESSION_TTL_SEC || 1800);
  },
  get tUserProfile() {
    return process.env.TABLE_USER_PROFILE || 'UserProfile';
  },
  get tUserSession() {
    return process.env.TABLE_USER_SESSION || 'UserSession';
  },
  get tUserActivity() {
    return process.env.TABLE_USER_ACTIVITY || 'UserActivity';
  },
  get tDecision() {
    return process.env.TABLE_DECISION_STORE || 'DecisionStore';
  },
  get tUserState() {
    return process.env.TABLE_USER_STATE || 'UserState';
  },
  // Admin decisions list: default page size and hard cap.
  get adminDecisionsDefaultLimit() {
    return Number(process.env.ADMIN_DECISIONS_DEFAULT_LIMIT || 50);
  },
  get adminDecisionsMaxLimit() {
    return Number(process.env.ADMIN_DECISIONS_MAX_LIMIT || 200);
  },
  get adminDecisionsExportMaxItems() {
    return Number(process.env.ADMIN_DECISIONS_EXPORT_MAX_ITEMS || 10000);
  },
  // Admin users list: default page size and hard cap.
  get adminUsersDefaultLimit() {
    return Number(process.env.ADMIN_USERS_DEFAULT_LIMIT || 50);
  },
  get adminUsersMaxLimit() {
    return Number(process.env.ADMIN_USERS_MAX_LIMIT || 100);
  },
  // Admin sessions list: default page size and hard cap.
  get adminSessionsDefaultLimit() {
    return Number(process.env.ADMIN_SESSIONS_DEFAULT_LIMIT || 100);
  },
  get adminSessionsMaxLimit() {
    return Number(process.env.ADMIN_SESSIONS_MAX_LIMIT || 500);
  },
  // LLM cost estimate per L1+L2 call (tune once real pricing lands).
  get estLlmUnitUsd() {
    return Number(process.env.EST_LLM_UNIT_USD || 0.0006);
  },
  // Risk score half-life in seconds (default 24 h).
  get riskHalfLifeSec() {
    return Number(process.env.RISK_HALF_LIFE_SEC || 24 * 3600);
  },
  // Sparkline window in days and row limit for getUserRisk.
  get riskSparklineWindowDays() {
    return Number(process.env.RISK_SPARKLINE_WINDOW_DAYS || 7);
  },
  get riskSparklineLimit() {
    return Number(process.env.RISK_SPARKLINE_LIMIT || 20);
  },
};

module.exports = { CFG };
