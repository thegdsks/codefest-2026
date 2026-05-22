'use strict';

/**
 * scoreLogin - pure L1 auth scoring function.
 *
 * Inputs:
 *   lastLocation  {string|null} - location from this user's prior successful login
 *   lastTime      {number|null} - unix seconds of this user's prior successful login
 *   currentLocation {string}   - location from this login attempt
 *   now           {number}     - current unix seconds
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Thresholds (per-user comparison only - each userId history is independent):
 *   delta < 60s  + different location  -> score 90, HIGH, BLOCK  (IMPOSSIBLE_TRAVEL)
 *   60s <= delta <= 1800s + different location -> score 70, MEDIUM, MFA (SUSPICIOUS_LOCATION)
 *   else (same location or delta > 1800s)     -> score 10, LOW, ALLOW
 *
 * The 60s BLOCK window is narrow enough that switching personas in quick
 * succession during a demo does not trip impossible-travel on a per-user
 * basis. Each user's lastLoginTime is independent so persona A switching
 * to persona B never crosses state.
 */
function scoreLogin({ lastLocation, lastTime, currentLocation, now }) {
  const safe = {
    score: 10,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'NORMAL_LOGIN',
    reasonText: 'Login looks normal.',
    category: 'AUTH',
    needsExplanation: false,
  };

  // No prior session data to compare against
  if (!lastLocation || lastTime == null || !currentLocation || now == null) {
    return safe;
  }

  const sameLocation = String(lastLocation).toLowerCase() === String(currentLocation).toLowerCase();

  if (sameLocation) {
    return safe;
  }

  const delta = now - lastTime;

  if (delta < 60) {
    return {
      score: 90,
      riskLevel: 'HIGH',
      action: 'BLOCK',
      reasonCode: 'IMPOSSIBLE_TRAVEL',
      reasonText: 'Location changed too fast to be physically possible.',
      category: 'AUTH',
      needsExplanation: false,
    };
  }

  if (delta <= 1800) {
    return {
      score: 70,
      riskLevel: 'MEDIUM',
      action: 'MFA',
      reasonCode: 'SUSPICIOUS_LOCATION',
      reasonText: 'Location changed within 30 minutes; step-up verification required.',
      category: 'AUTH',
      needsExplanation: true,
    };
  }

  return safe;
}

module.exports = { scoreLogin };
