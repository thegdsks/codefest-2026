'use strict';

/**
 * engagement.js - L1 scorer functions for the five engagement signals.
 *
 * Each scorer takes event params + a (possibly null) user profile and returns
 * an L1 draft decision object in the same shape as the existing rules modules:
 *
 *   {
 *     score:            number  (0..100)
 *     riskLevel:        'LOW' | 'MEDIUM' | 'HIGH'
 *     action:           'ALLOW' | 'NUDGE' | 'OFFER' | 'HINT'
 *     reasonCode:       string
 *     reasonText:       string
 *     category:         string
 *     needsExplanation: boolean
 *     draftAction:      string  (mirrors action, used by calling code)
 *   }
 *
 * Gray zone: score 40-70 (inclusive) with needsExplanation=true routes to L2.
 * Below 40 or above 70 with needsExplanation=false short-circuits at L1.
 *
 * All thresholds are read from process.env so marketing/ops can tune them via
 * Lambda environment variables without a redeploy.
 *
 * Env vars (with defaults):
 *   ENGAGEMENT_RAGE_CLICK_HIGH  - clicks in 1s window for HIGH (default 5)
 *   ENGAGEMENT_RAGE_CLICK_MID   - clicks in 1s window for MEDIUM (default 3)
 *   ENGAGEMENT_DWELL_HIGH_MS    - dwell ms for HIGH (default 30000)
 *   ENGAGEMENT_DWELL_MID_MS     - dwell ms for MEDIUM (default 15000)
 *   ENGAGEMENT_STARE_HIGH_MS    - points stare ms for HIGH (default 8000)
 *   ENGAGEMENT_STARE_MID_MS     - points stare ms for MEDIUM (default 4000)
 *   ENGAGEMENT_QUERY_HIGH       - repeated query count for HIGH (default 4)
 *   ENGAGEMENT_QUERY_MID        - repeated query count for MEDIUM (default 2)
 *   ENGAGEMENT_ABANDON_HIGH     - step depth for HIGH (default 3)
 *   ENGAGEMENT_ABANDON_MID      - step depth for MEDIUM (default 2)
 */

function envInt(name, fallback) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// scoreRageClick
// ---------------------------------------------------------------------------

/**
 * Score a rage-click signal (>=N clicks within 1s on the same element).
 *
 * @param {{ clickCount?: number, targetSelector?: string }} params
 * @param {object|null} _profile - unused, reserved for future loyalty context
 * @returns {{ score: number, riskLevel: string, action: string, reasonCode: string, reasonText: string, category: string, needsExplanation: boolean, draftAction: string }}
 */
function scoreRageClick(params, _profile) {
  const _rc = params && params.clickCount;
  const count = Number.isFinite(Number(_rc)) ? Number(_rc) : 0;
  const highThresh = envInt('ENGAGEMENT_RAGE_CLICK_HIGH', 5);
  const midThresh = envInt('ENGAGEMENT_RAGE_CLICK_MID', 3);

  if (count >= highThresh) {
    return {
      score: 75,
      riskLevel: 'HIGH',
      action: 'HINT',
      reasonCode: 'RAGE_CLICK_HIGH',
      reasonText: 'User is rage-clicking; show an inline help tooltip immediately.',
      category: 'ENGAGEMENT',
      needsExplanation: false,
      draftAction: 'HINT',
    };
  }

  if (count >= midThresh) {
    return {
      score: 55,
      riskLevel: 'MEDIUM',
      action: 'HINT',
      reasonCode: 'RAGE_CLICK_MID',
      reasonText: 'Repeated clicks detected; grey-zone, escalate to L2 for copy.',
      category: 'ENGAGEMENT',
      needsExplanation: true,
      draftAction: 'HINT',
    };
  }

  return {
    score: 10,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'RAGE_CLICK_LOW',
    reasonText: 'Click count within normal range; no intervention.',
    category: 'ENGAGEMENT',
    needsExplanation: false,
    draftAction: 'ALLOW',
  };
}

// ---------------------------------------------------------------------------
// scoreDwellNoAction
// ---------------------------------------------------------------------------

/**
 * Score a dwell-without-action signal (user views a page for N ms without
 * any meaningful interaction).
 *
 * @param {{ dwellMs?: number, page?: string }} params
 * @param {object|null} _profile
 * @returns {object}
 */
function scoreDwellNoAction(params, _profile) {
  const _dm = params && params.dwellMs;
  const dwell = Number.isFinite(Number(_dm)) ? Number(_dm) : 0;
  const highThresh = envInt('ENGAGEMENT_DWELL_HIGH_MS', 30000);
  const midThresh = envInt('ENGAGEMENT_DWELL_MID_MS', 15000);

  if (dwell >= highThresh) {
    return {
      score: 80,
      riskLevel: 'HIGH',
      action: 'NUDGE',
      reasonCode: 'DWELL_HIGH',
      reasonText: 'Extended dwell without action; show a nudge banner.',
      category: 'ENGAGEMENT',
      needsExplanation: false,
      draftAction: 'NUDGE',
    };
  }

  if (dwell >= midThresh) {
    return {
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'NUDGE',
      reasonCode: 'DWELL_MID',
      reasonText: 'Moderate dwell without action; escalate to L2 for personalised copy.',
      category: 'ENGAGEMENT',
      needsExplanation: true,
      draftAction: 'NUDGE',
    };
  }

  return {
    score: 5,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'DWELL_LOW',
    reasonText: 'Dwell time within normal bounds; no intervention.',
    category: 'ENGAGEMENT',
    needsExplanation: false,
    draftAction: 'ALLOW',
  };
}

// ---------------------------------------------------------------------------
// scoreAbandonedFlowStep
// ---------------------------------------------------------------------------

/**
 * Score an abandoned-flow-step signal (user navigated away mid-flow).
 *
 * @param {{ stepDepth?: number, flowName?: string }} params
 * @param {object|null} _profile
 * @returns {object}
 */
function scoreAbandonedFlowStep(params, _profile) {
  const _sd = params && params.stepDepth;
  const depth = Number.isFinite(Number(_sd)) ? Number(_sd) : 0;
  const highThresh = envInt('ENGAGEMENT_ABANDON_HIGH', 3);
  const midThresh = envInt('ENGAGEMENT_ABANDON_MID', 2);

  if (depth >= highThresh) {
    return {
      score: 85,
      riskLevel: 'HIGH',
      action: 'OFFER',
      reasonCode: 'ABANDON_DEEP',
      reasonText: 'User abandoned a deep flow step; show a recovery offer modal.',
      category: 'ENGAGEMENT',
      needsExplanation: false,
      draftAction: 'OFFER',
    };
  }

  if (depth >= midThresh) {
    return {
      score: 65,
      riskLevel: 'MEDIUM',
      action: 'OFFER',
      reasonCode: 'ABANDON_MID',
      reasonText: 'Mid-flow abandonment; escalate to L2 for offer copy.',
      category: 'ENGAGEMENT',
      needsExplanation: true,
      draftAction: 'OFFER',
    };
  }

  return {
    score: 15,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'ABANDON_LOW',
    reasonText: 'Shallow abandonment; no offer triggered.',
    category: 'ENGAGEMENT',
    needsExplanation: false,
    draftAction: 'ALLOW',
  };
}

// ---------------------------------------------------------------------------
// scoreRepeatedQuery
// ---------------------------------------------------------------------------

/**
 * Score a repeated-query signal (user submits the same search N times).
 *
 * @param {{ queryCount?: number, queryText?: string }} params
 * @param {object|null} _profile
 * @returns {object}
 */
function scoreRepeatedQuery(params, _profile) {
  const _qc = params && params.queryCount;
  const count = Number.isFinite(Number(_qc)) ? Number(_qc) : 0;
  const highThresh = envInt('ENGAGEMENT_QUERY_HIGH', 4);
  const midThresh = envInt('ENGAGEMENT_QUERY_MID', 2);

  if (count >= highThresh) {
    return {
      score: 78,
      riskLevel: 'HIGH',
      action: 'HINT',
      reasonCode: 'REPEATED_QUERY_HIGH',
      reasonText: 'User cannot find what they need; show an inline help tooltip.',
      category: 'ENGAGEMENT',
      needsExplanation: false,
      draftAction: 'HINT',
    };
  }

  if (count >= midThresh) {
    return {
      score: 50,
      riskLevel: 'MEDIUM',
      action: 'HINT',
      reasonCode: 'REPEATED_QUERY_MID',
      reasonText: 'Repeated search pattern; escalate to L2 for help copy.',
      category: 'ENGAGEMENT',
      needsExplanation: true,
      draftAction: 'HINT',
    };
  }

  return {
    score: 5,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'REPEATED_QUERY_LOW',
    reasonText: 'Query count within normal range; no intervention.',
    category: 'ENGAGEMENT',
    needsExplanation: false,
    draftAction: 'ALLOW',
  };
}

// ---------------------------------------------------------------------------
// scorePointsBalanceStare
// ---------------------------------------------------------------------------

/**
 * Score a points-balance-stare signal (user views the points panel for N ms
 * without redeeming or transferring).
 *
 * @param {{ dwellMs?: number, pointsBalance?: number }} params
 * @param {object|null} _profile
 * @returns {object}
 */
function scorePointsBalanceStare(params, _profile) {
  const _pm = params && params.dwellMs;
  const dwell = Number.isFinite(Number(_pm)) ? Number(_pm) : 0;
  const highThresh = envInt('ENGAGEMENT_STARE_HIGH_MS', 8000);
  const midThresh = envInt('ENGAGEMENT_STARE_MID_MS', 4000);

  if (dwell >= highThresh) {
    return {
      score: 82,
      riskLevel: 'HIGH',
      action: 'OFFER',
      reasonCode: 'POINTS_STARE_HIGH',
      reasonText: 'User is staring at their points balance; show a redemption offer modal.',
      category: 'ENGAGEMENT',
      needsExplanation: false,
      draftAction: 'OFFER',
    };
  }

  if (dwell >= midThresh) {
    return {
      score: 62,
      riskLevel: 'MEDIUM',
      action: 'OFFER',
      reasonCode: 'POINTS_STARE_MID',
      reasonText: 'Moderate points stare; escalate to L2 for personalised offer copy.',
      category: 'ENGAGEMENT',
      needsExplanation: true,
      draftAction: 'OFFER',
    };
  }

  return {
    score: 5,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'POINTS_STARE_LOW',
    reasonText: 'Brief points view; no offer triggered.',
    category: 'ENGAGEMENT',
    needsExplanation: false,
    draftAction: 'ALLOW',
  };
}

module.exports = {
  scoreRageClick,
  scoreDwellNoAction,
  scoreAbandonedFlowStep,
  scoreRepeatedQuery,
  scorePointsBalanceStare,
};
