import type { DecisionRow } from '@/lib/admin-api';

export type ActionKey = 'ALLOW' | 'BLOCK' | 'MFA' | 'REVIEW' | 'OFFER' | 'NUDGE' | string;

export interface DecisionBucket {
  /** Unix epoch milliseconds — start of the bucket */
  ts: number;
  ALLOW: number;
  BLOCK: number;
  MFA: number;
  REVIEW: number;
  OFFER: number;
  NUDGE: number;
  OTHER: number;
}

const KNOWN_ACTIONS = new Set(['ALLOW', 'BLOCK', 'MFA', 'REVIEW', 'OFFER', 'NUDGE']);

function emptyBucket(ts: number): DecisionBucket {
  return { ts, ALLOW: 0, BLOCK: 0, MFA: 0, REVIEW: 0, OFFER: 0, NUDGE: 0, OTHER: 0 };
}

/**
 * Reduces a flat list of DecisionRow records into time-bucketed counts per action.
 *
 * @param decisions - Raw decisions from getDecisions()
 * @param windowMs  - Total window duration in milliseconds (e.g., 24 * 60 * 60 * 1000)
 * @param bucketMs  - Duration of each bucket in milliseconds (e.g., 30 * 60 * 1000)
 * @returns Array of DecisionBucket, one entry per bucket, ordered oldest-first.
 */
export function bucketDecisions(
  decisions: DecisionRow[],
  windowMs: number,
  bucketMs: number
): DecisionBucket[] {
  const now = Date.now();
  const windowStart = now - windowMs;

  const bucketCount = Math.ceil(windowMs / bucketMs);
  const buckets: DecisionBucket[] = Array.from({ length: bucketCount }, (_, i) =>
    emptyBucket(windowStart + i * bucketMs)
  );

  for (const d of decisions) {
    // decision timestamps are in seconds (Unix epoch)
    const tsMs = d.timestamp * 1000;
    if (tsMs < windowStart || tsMs > now) continue;

    const idx = Math.floor((tsMs - windowStart) / bucketMs);
    const clampedIdx = Math.min(idx, bucketCount - 1);
    const bucket = buckets[clampedIdx];
    if (!bucket) continue;

    const action = d.action as string;
    if (KNOWN_ACTIONS.has(action)) {
      (bucket as unknown as Record<string, number>)[action] += 1;
    } else {
      bucket.OTHER += 1;
    }
  }

  return buckets;
}

/**
 * Reduces a flat list of DecisionRow records into 10-point score histogram bins.
 * Returns 10 bins covering 0-9, 10-19, ..., 90-99.
 */
export interface ScoreBin {
  label: string;
  l1: number;
  l1l2: number;
}

export function bucketScores(decisions: DecisionRow[]): ScoreBin[] {
  const bins: ScoreBin[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}-${i * 10 + 9}`,
    l1: 0,
    l1l2: 0,
  }));

  for (const d of decisions) {
    const score = Math.max(0, Math.min(99, Math.round(d.score)));
    const binIdx = Math.floor(score / 10);
    const bin = bins[binIdx];
    if (!bin) continue;
    if (d.engineLayer === 'L1') {
      bin.l1 += 1;
    } else {
      bin.l1l2 += 1;
    }
  }

  return bins;
}

/**
 * Derives a sparkline series (last N bucket totals) for a given action from bucketed data.
 */
export function sparklineSeries(
  buckets: DecisionBucket[],
  action: keyof Omit<DecisionBucket, 'ts'> | 'TOTAL',
  count: number
): number[] {
  const slice = buckets.slice(-count);
  return slice.map((b) => {
    if (action === 'TOTAL') {
      return b.ALLOW + b.BLOCK + b.MFA + b.REVIEW + b.OFFER + b.NUDGE + b.OTHER;
    }
    return (b as unknown as Record<string, number>)[action as string] ?? 0;
  });
}

/** Window helpers — converts a Window string to milliseconds for both window and bucket. */
export function windowToMs(w: '5m' | '1h' | '6h' | '24h' | '7d' | '30d'): {
  windowMs: number;
  bucketMs: number;
} {
  if (w === '5m') return { windowMs: 5 * 60 * 1000, bucketMs: 30 * 1000 };
  if (w === '1h') return { windowMs: 60 * 60 * 1000, bucketMs: 2 * 60 * 1000 };
  if (w === '6h') return { windowMs: 6 * 60 * 60 * 1000, bucketMs: 15 * 60 * 1000 };
  if (w === '7d') return { windowMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 2 * 60 * 60 * 1000 };
  if (w === '30d') return { windowMs: 30 * 24 * 60 * 60 * 1000, bucketMs: 12 * 60 * 60 * 1000 };
  // 24h default
  return { windowMs: 24 * 60 * 60 * 1000, bucketMs: 30 * 60 * 1000 };
}
