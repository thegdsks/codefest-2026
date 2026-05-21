import {
  Award,
  Eye,
  Hourglass,
  LogOut,
  type LucideIcon,
  MailCheck,
  MousePointerClick,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Field } from 'react-querybuilder';

export const fields: Field[] = [
  // Signal fields
  {
    name: 'rage_click_count',
    label: 'Rage Click Count',
    inputType: 'number',
    operators: [
      { name: '>', label: 'greater than' },
      { name: '>=', label: 'at least' },
      { name: '<', label: 'less than' },
      { name: '=', label: 'equals' },
    ],
  },
  {
    name: 'rage_click_window',
    label: 'Rage Click Window (s)',
    inputType: 'number',
    operators: [
      { name: '<=', label: 'within (s)' },
      { name: '>', label: 'longer than (s)' },
    ],
  },
  {
    name: 'dwell_no_action_threshold_ms',
    label: 'Dwell Without Action (ms)',
    inputType: 'number',
    operators: [
      { name: '>=', label: 'at least (ms)' },
      { name: '>', label: 'greater than (ms)' },
      { name: '<', label: 'less than (ms)' },
    ],
  },
  {
    name: 'abandoned_flow_step',
    label: 'Abandoned Flow Step',
    inputType: 'text',
    operators: [
      { name: '=', label: 'is' },
      { name: '!=', label: 'is not' },
    ],
  },
  {
    name: 'abandoned_flow_id',
    label: 'Abandoned Flow ID',
    inputType: 'text',
    operators: [
      { name: '=', label: 'is' },
      { name: '!=', label: 'is not' },
    ],
  },
  {
    name: 'repeated_query_count',
    label: 'Repeated Query Count',
    inputType: 'number',
    operators: [
      { name: '>=', label: 'at least' },
      { name: '>', label: 'more than' },
    ],
  },
  {
    name: 'repeated_query_term',
    label: 'Repeated Query Term',
    inputType: 'text',
    operators: [
      { name: '=', label: 'equals' },
      { name: 'contains', label: 'contains' },
      { name: 'beginsWith', label: 'begins with' },
    ],
  },
  {
    name: 'points_balance_stare_threshold_ms',
    label: 'Points Balance Stare (ms)',
    inputType: 'number',
    operators: [
      { name: '>=', label: 'at least (ms)' },
      { name: '>', label: 'greater than (ms)' },
    ],
  },
  // User attribute fields
  {
    name: 'tier',
    label: 'Loyalty Tier',
    valueEditorType: 'select',
    values: [
      { name: 'silver', label: 'Silver' },
      { name: 'gold', label: 'Gold' },
      { name: 'platinum', label: 'Platinum' },
      { name: 'ambassador', label: 'Ambassador' },
    ],
    operators: [
      { name: '=', label: 'is' },
      { name: '!=', label: 'is not' },
    ],
  },
  {
    name: 'loyaltyScore',
    label: 'Loyalty Score',
    inputType: 'number',
    operators: [
      { name: '>=', label: 'at least' },
      { name: '>', label: 'greater than' },
      { name: '<', label: 'less than' },
      { name: '<=', label: 'at most' },
      { name: '=', label: 'equals' },
    ],
  },
  {
    name: 'emailVerified',
    label: 'Email Verified',
    valueEditorType: 'checkbox',
    operators: [{ name: '=', label: 'is' }],
    defaultValue: true,
  },
];

export const defaultQuery = {
  combinator: 'and' as const,
  rules: [],
};

// Signal field names used to drive UX (icons, color, plain-English copy).
export const SIGNAL_FIELDS = new Set<string>([
  'rage_click_count',
  'rage_click_window',
  'dwell_no_action_threshold_ms',
  'abandoned_flow_step',
  'abandoned_flow_id',
  'repeated_query_count',
  'repeated_query_term',
  'points_balance_stare_threshold_ms',
]);

export const USER_FIELDS = new Set<string>(['tier', 'loyaltyScore', 'emailVerified']);

// Per-field Lucide icon used to render the badge above each query row.
export const SIGNAL_ICONS: Record<string, LucideIcon> = {
  rage_click_count: MousePointerClick,
  rage_click_window: MousePointerClick,
  dwell_no_action_threshold_ms: Hourglass,
  abandoned_flow_step: LogOut,
  abandoned_flow_id: LogOut,
  repeated_query_count: Search,
  repeated_query_term: Search,
  points_balance_stare_threshold_ms: Eye,
  tier: Award,
  loyaltyScore: Sparkles,
  emailVerified: MailCheck,
};

// Per-field one-line help shown below each query row.
export const FIELD_HINTS: Record<string, string> = {
  rage_click_count: 'clicks in a short window, 5 is the typical floor for rage',
  rage_click_window: 'window length in seconds, 3 is a tight burst',
  dwell_no_action_threshold_ms: 'milliseconds, 8000 = 8 seconds of staring',
  abandoned_flow_step: 'flow step name, e.g. confirm or review',
  abandoned_flow_id: 'flow identifier, e.g. transfer or redeem',
  repeated_query_count: 'how many times the same query was issued',
  repeated_query_term: 'the literal search term the user retried',
  points_balance_stare_threshold_ms: 'milliseconds spent looking at the balance widget',
  tier: 'Silver, Gold, Platinum, or Ambassador',
  loyaltyScore: 'fraud-adjusted score, 0 to 100',
  emailVerified: 'true if the email has been confirmed',
};
