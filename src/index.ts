import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectMongo, disconnectMongo } from './config/mongodb';
import { disconnectRedis } from './config/redis';
import { initializeQdrantCollections, healthCheckQdrant } from './config/qdrant';
import { startWorker, stopWorker } from './services/queue/worker';
import { errorHandler } from './middleware/error-handler';
import { BatchOrchestrator } from './services/batch/index';

// Routes
import healthRouter from './routes/health';
import buyersRouter from './routes/buyers';
import jobsRouter from './routes/jobs';
import analyticsRouter from './routes/analytics';
import contactsRouter from './routes/contacts';
import enrichAllRouter from './routes/enrich-all';

async function main() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Connect databases
  await connectMongo();

  // Initialize Qdrant collections
  const qdrantHealthy = await healthCheckQdrant();
  if (!qdrantHealthy) {
    logger.warn('Qdrant is not available. RAG features will be disabled.');
  } else {
    await initializeQdrantCollections();
    logger.info('Qdrant collections initialized');
  }

  // Start BullMQ worker
  startWorker(2);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/buyers', buyersRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/enrich-all', enrichAllRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/analytics', analyticsRouter);

  // Error handler
  app.use(errorHandler);

  // Serve built React dashboard (production / Docker)
  const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
  if (fs.existsSync(dashboardDist)) {
    app.use(express.static(dashboardDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dashboardDist, 'index.html'));
    });
    logger.info(`Dashboard served from ${dashboardDist}`);
  }

  // Start server
  app.listen(env.PORT, () => {
    logger.info(`Buyer Intelligence API running on port ${env.PORT}`);
    logger.info(`   Health: http://localhost:${env.PORT}/api/health`);
    logger.info(`   Buyers: http://localhost:${env.PORT}/api/buyers`);
    logger.info(`   Analytics: http://localhost:${env.PORT}/api/analytics/pipeline`);
  });

  // Daily batch — runs at 02:00 every day
  const batchOrchestrator = new BatchOrchestrator();
  cron.schedule('0 2 * * *', async () => {
    logger.info('Daily batch starting', { limit: env.DAILY_RESEARCH_LIMIT });
    try {
      await batchOrchestrator.runBatch({ action: 'full', limit: env.DAILY_RESEARCH_LIMIT });
    } catch (err: any) {
      logger.error('Daily batch failed', { error: err.message });
    }
  });
  logger.info('Daily batch scheduled at 02:00');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    await stopWorker();
    await disconnectRedis();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
