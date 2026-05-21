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
