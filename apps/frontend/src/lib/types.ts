// API envelope types

export interface ApiSuccess<T> {
  correlationId: string;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: string;
}

export interface ApiError {
  correlationId: string;
  error: ApiErrorDetail;
}

export type ApiResult<T> =
  | { data: T; error: null; correlationId: string }
  | { data: null; error: ApiErrorDetail; correlationId: string };

// Auth

export interface LoginRequest {
  username: string;
  password: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  expiresAt: string;
  mfaRequired: boolean;
}

export interface LoginResponse {
  session: Session;
  user: User;
}

// User

export interface User {
  userId: string;
  name: string;
  email: string;
  tier: string;
  pointsBalance: number;
}

// Offers

export interface Offer {
  offerId: string;
  title: string;
  description: string;
  pointsCost: number;
  expiresAt: string;
}

// Nudges

export interface Nudge {
  nudgeId: string;
  type: string;
  message: string;
  priority: number;
}

// Dashboard

export interface DashboardResponse {
  user: User;
  offers: Offer[];
  nudges: Nudge[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  activityId: string;
  type: string;
  description: string;
  points: number;
  createdAt: string;
}
