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
  get tEngagementRules() {
    return process.env.TABLE_ENGAGEMENT_RULES || 'EngagementRules';
  },
  // When DEMO_MODE=1, the /admin/dev/reseed endpoint is active and the
  // Settings UI shows the Demo controls section.
  get demoMode() {
    return process.env.DEMO_MODE === '1';
  },
  // LLM fallback chain config
  get litellmFallbackModels() {
    const raw = process.env.LITELLM_FALLBACK_MODELS || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get litellmTimeoutMs() {
    return Number(process.env.LITELLM_TIMEOUT_MS || 8000);
  },
  get litellmTotalBudgetMs() {
    return Number(process.env.LITELLM_TOTAL_BUDGET_MS || 15000);
  },
  // Admin decisions list: default page size and hard cap.
  get adminDecisionsDefaultLimit() {
    return Number(process.env.ADMIN_DECISIONS_DEFAULT_LIMIT || 50);
  },
  get adminDecisionsMaxLimit() {
    return Number(process.env.ADMIN_DECISIONS_MAX_LIMIT || 500);
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
  // Daily LLM cost cap for the responsible-AI budget tile. Matches the cost cap.
  get llmDailyBudgetUsd() {
    return Number(process.env.LLM_DAILY_BUDGET_USD || 250);
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
  // Transfer MFA gate: transfers at or above this amount trigger the unseen-device check.
  get largeTransferAmountUsd() {
    return Number(process.env.LARGE_TRANSFER_AMOUNT_USD || 5000);
  },
  // Transfer MFA gate: device must have been seen within this many days, else the rule fires.
  get unseenDeviceDaysThreshold() {
    return Number(process.env.UNSEEN_DEVICE_DAYS_THRESHOLD || 30);
  },
  // TTL for a transfer MFA challenge row in UserSession (default 5 min).
  get transferMfaTtlSec() {
    return Number(process.env.TRANSFER_MFA_TTL_SEC || 300);
  },
};

module.exports = { CFG };
