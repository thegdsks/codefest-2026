export type PersonaTier = 'Silver' | 'Gold' | 'Platinum';

export interface TestPersona {
  userId: string;
  username: string;
  password: string;
  name: string;
  label: string;
  tagline: string;
  tier: PersonaTier;
  points: number;
  profilePct: number;
  mfaEnrolled: boolean;
  /** Pre-filled partner account ID for the transfer form. */
  partnerAccountId: string;
}

export const TEST_PERSONAS: TestPersona[] = [
  {
    userId: 'USER#031',
    username: 'maya031',
    password: 'Password1',
    name: 'Maya',
    label: 'Silver Newcomer',
    tagline: 'First-time member, many surfaces to discover',
    tier: 'Silver',
    points: 1500,
    profilePct: 25,
    mfaEnrolled: false,
    partnerAccountId: 'AG-7731021',
  },
  {
    userId: 'USER#032',
    username: 'dre032',
    password: 'Password1',
    name: 'Dre',
    label: 'Gold Near-Platinum',
    tagline: '500 points from Platinum, three upgrade surfaces active',
    tier: 'Gold',
    points: 49500,
    profilePct: 75,
    mfaEnrolled: false,
    partnerAccountId: 'AG-4403291',
  },
  {
    userId: 'USER#033',
    username: 'priya033',
    password: 'Password1',
    name: 'Priya',
    label: 'Platinum Elite',
    tagline: 'Top tier, AI demotes nudges, only celebratory states shown',
    tier: 'Platinum',
    points: 120000,
    profilePct: 95,
    mfaEnrolled: true,
    partnerAccountId: 'SH-9901834',
  },
  {
    userId: 'USER#034',
    username: 'ethan034',
    password: 'Password1',
    name: 'Ethan',
    label: 'Frequent Transferrer',
    tagline: '3 transfers in last hour, ideal for velocity-rule demo',
    tier: 'Gold',
    points: 32000,
    profilePct: 60,
    mfaEnrolled: true,
    partnerAccountId: 'EV-5512047',
  },
  {
    userId: 'USER#035',
    username: 'naomi035',
    password: 'Password1',
    name: 'Naomi',
    label: 'The Abandoner',
    tagline: 'Left a 5,000-point transfer 90 seconds ago',
    tier: 'Silver',
    points: 4200,
    profilePct: 40,
    mfaEnrolled: false,
    partnerAccountId: 'AG-3304512',
  },
  {
    userId: 'USER#036',
    username: 'marcus036',
    password: 'Password1',
    name: 'Marcus',
    label: 'Cautious Browser',
    tagline: 'Rage-click and dwell signals, rich AI reasoning context',
    tier: 'Gold',
    points: 18000,
    profilePct: 55,
    mfaEnrolled: true,
    partnerAccountId: 'SH-6628103',
  },
  {
    userId: 'USER#037',
    username: 'inez037',
    password: 'Password1',
    name: 'Inez',
    label: 'The Booker',
    tagline: 'Booked 3 nights just minutes ago, confirmation surface fires',
    tier: 'Platinum',
    points: 88000,
    profilePct: 80,
    mfaEnrolled: true,
    partnerAccountId: 'EV-1194823',
  },
  {
    userId: 'USER#038',
    username: 'owen038',
    password: 'Password1',
    name: 'Owen',
    label: 'Flagged Suspicious',
    tagline: 'Recent BLOCK and REVIEW decisions, fraud-explainer demo',
    tier: 'Silver',
    points: 8800,
    profilePct: 30,
    mfaEnrolled: false,
    partnerAccountId: 'AG-8843761',
  },
];
