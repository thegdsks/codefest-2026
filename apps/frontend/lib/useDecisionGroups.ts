import { useMemo } from 'react';
import type { DecisionGroup } from '@/components/admin/DecisionFeedRow';
import type { DecisionRow } from './admin-api';

// Two decisions share a group if they have the same userId, decisionType,
// action, and reasonCode AND timestamps within 5 minutes of each other.
const GROUP_WINDOW_SEC = 5 * 60;

function groupKey(row: DecisionRow): string {
  return `${row.userId}|${row.decisionType}|${row.action}|${row.reasonCode ?? ''}`;
}

/**
 * O(n) grouping: fold consecutive rows with matching group key that fall
 * within GROUP_WINDOW_SEC of the previous row in the same run.
 *
 * Memoized on the rows reference - only recomputes when rows changes.
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
        if (row.timestamp > current.latest.timestamp) {
          current.latest = row;
        }
        current.count += 1;
      } else {
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
