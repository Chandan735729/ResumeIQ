/**
 * Authentication Module Types & Interfaces
 * 
 * Core data transfer objects and type definitions for authentication flow
 */

export interface RegisterDTO {
  email: string;
  name: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RefreshTokenDTO {
  refreshToken: string;
}

export interface LogoutDTO {
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  lastLogin: Date | null;
  createdAt: Date;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
}

export interface LoginResponse extends TokenResponse {
  refreshToken: string;
  user: UserResponse;
}

export interface RefreshTokenResponse extends TokenResponse {
  accessToken: string;
}

export interface JWTPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat: number; // issued at
  exp: number; // expiration
}

export interface AuthenticatedRequest {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiError[] | null;
}

export interface ApiError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}
