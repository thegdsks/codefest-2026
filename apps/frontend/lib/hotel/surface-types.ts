export interface SurfaceCopy {
  headline: string;
  body: string;
}

export type SurfaceState = 'SHOWN' | 'HIDDEN' | 'PENDING' | 'COMPLETED';

export type NextActionTarget =
  | 'profileCompletion'
  | 'tier'
  | 'mfaEnrolled'
  | 'flow.transfer'
  | 'booking';

export interface NextAction {
  label: string;
  target: NextActionTarget;
  delta?: Record<string, unknown>;
}

export interface PrestigeAdvanceContext {
  pointsToNextTier: number;
  currentTier: string;
  nextTier: string;
}

export interface CatalystElevateContext {
  profileCompletion: number;
  currentTier: string;
  nextTier: string;
}

export interface MfaEnrollmentContext {
  hasMfa: boolean;
  currentTier: string;
}

export interface TransferAbandonContext {
  hasDraft: boolean;
  lastUpdatedAt?: number;
}

export interface BookingContext {
  hasRecentBooking: boolean;
  recentBookingAt?: number;
}

export type SurfaceContext =
  | PrestigeAdvanceContext
  | CatalystElevateContext
  | MfaEnrollmentContext
  | TransferAbandonContext
  | BookingContext;

export interface SurfaceEvaluation {
  surfaceId: string;
  state: SurfaceState;
  ruleId: string | null;
  context: SurfaceContext;
  copy: SurfaceCopy | null;
  reason: string;
  nextAction: NextAction | null;
}

export interface SurfaceEligibilityResponse {
  userId: string;
  surfaces: SurfaceEvaluation[];
}

/** Keyed lookup returned by useSurfaceEligibility */
export type SurfaceMap = Record<string, SurfaceEvaluation>;
