/**
 * CORS Configuration
 * 
 * Allows frontend to communicate with backend
 * In production, restrict to actual domain
 */

import type { CorsOptions } from 'cors';

export const corsOptions: CorsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  optionsSuccessStatus: 200,
};
