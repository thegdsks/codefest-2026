'use strict';

/**
 * scoreNudge - pure L1 profile nudge scoring function.
 *
 * Inputs:
 *   profileCompletion {number}  - 0..1 decimal completion ratio
 *   emailVerified     {boolean} - whether email is verified
 *   phoneVerified     {boolean} - whether phone is verified
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Nudge triggers when any of:
 *   profileCompletion < 0.8
 *   emailVerified is falsy
 *   phoneVerified is falsy
 *
 * Score is 70 (gray zone upper edge, needsExplanation = true)
 * so the T4 router will ask L2 to generate the nudge text.
 */
function scoreNudge({ profileCompletion, emailVerified, phoneVerified } = {}) {
  const completion = Number.isFinite(Number(profileCompletion)) ? Number(profileCompletion) : 0;
  const emailOk = !!emailVerified;
  const phoneOk = !!phoneVerified;

  if (completion < 0.8 || !emailOk || !phoneOk) {
    return {
      score: 70,
      riskLevel: 'MEDIUM',
      action: 'NUDGE',
      reasonCode: 'PROFILE_INCOMPLETE',
      reasonText: 'Profile or verification is incomplete; a nudge is warranted.',
      category: 'PROFILE',
      needsExplanation: true,
    };
  }

  return {
    score: 0,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'PROFILE_COMPLETE',
    reasonText: 'Profile is complete and verified.',
    category: 'PROFILE',
    needsExplanation: false,
  };
}

module.exports = { scoreNudge };
