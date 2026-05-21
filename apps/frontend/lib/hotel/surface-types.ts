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

export interface PropertyPersonalizedOfferContext {
  dwellMs: number;
  propertyId: string | null;
  userTier: string;
  userPointsBalance: number;
  pointsToNextTier: number;
}

export type SurfaceContext =
  | PrestigeAdvanceContext
  | CatalystElevateContext
  | MfaEnrollmentContext
  | TransferAbandonContext
  | BookingContext
  | PropertyPersonalizedOfferContext;

export type AiAction = 'KEEP' | 'PROMOTE' | 'DEMOTE' | 'HIDE' | 'SWAP';

export interface SurfaceEvaluation {
  surfaceId: string;
  state: SurfaceState;
  ruleId: string | null;
  context: SurfaceContext;
  copy: SurfaceCopy | null;
  reason: string;
  nextAction: NextAction | null;
  /** Present when aiMode=on and L2 prioritizer ran */
  aiAction?: AiAction;
  /** 1 = show first, 5 = least priority */
  aiPriority?: 1 | 2 | 3 | 4 | 5;
  /** Plain-English rationale from the LLM */
  aiRationale?: string;
}

export interface SurfaceEligibilityResponse {
  userId: string;
  surfaces: SurfaceEvaluation[];
  /** True when aiMode=on but LLM was unavailable */
  aiUnavailable?: boolean;
  /** True when aiMode=on and LLM ran successfully */
  aiMode?: boolean;
}

/** Keyed lookup returned by useSurfaceEligibility */
export type SurfaceMap = Record<string, SurfaceEvaluation>;
