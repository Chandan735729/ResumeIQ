/**
 * API Response Utility
 * 
 * Standardized response format for all API endpoints
 * Ensures consistent responses across the entire ResumeIQ API
 */

import { Response } from 'express';
import { ApiResponse, ApiError, ValidationError } from './auth.types';

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    errors: null,
  };
  return res.status(statusCode).json(response);
}

/**
 * Send error response with validation errors
 */
export function sendValidationError(
  res: Response,
  errors: ValidationError[],
  message: string = 'Validation failed',
  statusCode: number = 400
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    data: null,
    errors: errors.map(err => ({
      field: err.field,
      code: err.code,
      message: err.message,
    })),
  };
  return res.status(statusCode).json(response);
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: ApiError[]
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    data: null,
    errors: errors || null,
  };
  return res.status(statusCode).json(response);
}

/**
 * Parse validation error from Zod
 */
export function parseValidationError(error: any): ValidationError[] {
  if (error.type === 'VALIDATION_ERROR' && Array.isArray(error.errors)) {
    return error.errors;
  }
  return [];
}

export default {
  sendSuccess,
  sendValidationError,
  sendError,
  parseValidationError,
};
