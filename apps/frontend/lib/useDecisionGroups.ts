import { useMemo } from 'react';
import type { DecisionGroup } from '@/components/admin/DecisionFeedRow';
import type { DecisionRow } from './admin-api';

// Two decisions share a group key if they have the same userId, decisionType,
// action, and reasonCode AND their timestamps are within 5 minutes of each other.
const GROUP_WINDOW_SEC = 5 * 60;

function groupKey(row: DecisionRow): string {
  return `${row.userId}|${row.decisionType}|${row.action}|${row.reasonCode ?? ''}`;
}

/**
 * O(n) grouping: fold consecutive rows with matching group key that also fall
 * within GROUP_WINDOW_SEC of the previous row in that run.
 *
 * Memoized: only recomputes when `rows` reference changes.
 */
export function useDecisionGroups(rows: DecisionRow[]): DecisionGroup[] {
  return useMemo(() => {
    if (rows.length === 0) return [];

    const groups: DecisionGroup[] = [];
    let current: DecisionGroup | null = null;

    for (const row of rows) {
      const key = groupKey(row);
      if (
        current !== null &&
        current.key === key &&
        Math.abs(current.latest.timestamp - row.timestamp) <= GROUP_WINDOW_SEC
      ) {
        current.rows.push(row);
        // latest = the newest (rows come in newest-first order)
        if (row.timestamp > current.latest.timestamp) {
          current.latest = row;
        }
        current.count += 1;
      } else {
        // Start a new group
        current = {
          key: `${key}|${row.decisionId}`,
          rows: [row],
          latest: row,
          count: 1,
        };
        groups.push(current);
      }
    }

    return groups;
  }, [rows]);
}
