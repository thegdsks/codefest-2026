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
};

module.exports = { CFG };
