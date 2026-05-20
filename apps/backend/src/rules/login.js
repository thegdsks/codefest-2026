'use strict';

/**
 * scoreLogin - pure L1 auth scoring function.
 *
 * Inputs:
 *   lastLocation  {string|null} - location from prior session
 *   lastTime      {number|null} - unix seconds of prior login
 *   currentLocation {string}   - location from this login attempt
 *   now           {number}     - current unix seconds
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Thresholds:
 *   delta <= 300s + different location  -> score 90, HIGH, BLOCK
 *   delta <= 600s + different location  -> score 70, MEDIUM, MFA  (gray zone upper edge)
 *   else (same location or delta > 600) -> score 10, LOW, ALLOW
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

  if (delta <= 300) {
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

  if (delta <= 600) {
    return {
      score: 70,
      riskLevel: 'MEDIUM',
      action: 'MFA',
      reasonCode: 'IMPOSSIBLE_TRAVEL',
      reasonText: 'Suspicious location change in short window; step-up required.',
      category: 'AUTH',
      needsExplanation: true,
    };
  }

  return safe;
}

module.exports = { scoreLogin };
