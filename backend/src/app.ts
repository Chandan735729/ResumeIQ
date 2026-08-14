import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './modules/auth/auth.routes';
import { uploadRoutes } from './modules/uploads/uploads.routes';
import { jobDescriptionRoutes } from './modules/jobDescriptions/jobDescriptions.routes';
import { optimizationRoutes } from './modules/optimization/optimization.routes';
import { versionRoutes } from './modules/versions/versions.routes';
import { prisma } from './services/prisma.service';



const app: Application = express();

// ============================================
// Security Middleware
// ============================================

// Helmet: Set security HTTP headers
app.use(helmet());

// CORS: Allow frontend to communicate with backend
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3001');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  return next();
});

// Rate Limiting: Prevent abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// ============================================
// Body Parsing Middleware
// ============================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// Logging Middleware
// ============================================

app.use(requestLogger);

// ============================================
// Health Check Endpoint
// ============================================

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

// ============================================
// API Routes
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/resumes', uploadRoutes);
app.use('/api/resumes/:resumeId/versions', versionRoutes);
app.use('/api/jobs', jobDescriptionRoutes);
app.use('/api/optimization', optimizationRoutes);



// ============================================
// 404 Handler
// ============================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// ============================================
// Error Handler (Must be last)
// ============================================

app.use(errorHandler);

export default app;
