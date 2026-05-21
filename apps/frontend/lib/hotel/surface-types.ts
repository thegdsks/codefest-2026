export interface SurfaceCopy {
  headline: string;
  body: string;
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

export type SurfaceContext = PrestigeAdvanceContext | CatalystElevateContext;

export interface SurfaceEvaluation {
  surfaceId: string;
  eligible: boolean;
  ruleId: string | null;
  context: SurfaceContext;
  copy: SurfaceCopy | null;
  reason: string;
}

export interface SurfaceEligibilityResponse {
  userId: string;
  surfaces: SurfaceEvaluation[];
}

/** Keyed lookup returned by useSurfaceEligibility */
export type SurfaceMap = Record<string, SurfaceEvaluation>;
