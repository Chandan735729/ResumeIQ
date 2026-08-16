import app from './app';
import { logger } from './services/logger.service';
import dotenv from 'dotenv';
import { loadConfig } from './config/env';
import { prisma } from './services/prisma.service';

dotenv.config();
const config = loadConfig();
const PORT = config.PORT;

/**
 * Start the Express server
 * 
 * Why separate from app.ts?
 * - app.ts defines the Express application
 * - index.ts starts it and handles server lifecycle
 * - Makes testing easier (can start/stop server cleanly)
 */
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected successfully');

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info(`
        ╔════════════════════════════════════════╗
        ║         🚀 ResumeIQ API Started        ║
        ╠════════════════════════════════════════╣
        ║ Server: http://localhost:${PORT}
        ║ Environment: ${process.env.NODE_ENV || 'development'}
        ║ Database: PostgreSQL
        ║ Cache: Redis
        ╚════════════════════════════════════════╝
      `);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        await prisma.$disconnect();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        await prisma.$disconnect();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();
