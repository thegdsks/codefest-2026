/**
 * trust.ts
 *
 * Trust score delta table. Applied by the client on each signal emission.
 *
 * Each entry is the delta to apply to the rolling trust score when the
 * associated signal fires. Positive = recovery; negative = degradation.
 * Deltas are clamped to keep score in [0, 100].
 */

import { Signal } from './types.js';

export const TRUST_DELTAS: Record<string, number> = {
  // Degradation signals
  [Signal.RageClick]: -8,
  [Signal.DwellNoAction]: -3,
  [Signal.AbandonedFlowStep]: -4,
  [Signal.RepeatedQuery]: -2,
  [Signal.PointsBalanceStare]: 0,

  // Healthy signals (fired via trackHealthyEvent)
  completed_booking: +10,
  completed_transfer: +5,
  search_result_click: +2,
};
