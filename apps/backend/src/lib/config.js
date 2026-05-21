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
};

module.exports = { CFG };
