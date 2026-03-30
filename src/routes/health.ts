import { Router, Request, Response } from 'express';
import { getTradeDb, getBuyerDb } from '../config/mongodb';
import { getRedis } from '../config/redis';
import { ollamaHealthCheck } from '../services/ai/ollama';
import { env } from '../config/env';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const checks: Record<string, unknown> = {};

  // MongoDB
  try {
    await getTradeDb().command({ ping: 1 });
    await getBuyerDb().command({ ping: 1 });
    checks.mongodb = { status: 'ok' };
  } catch (err: any) {
    checks.mongodb = { status: 'error', message: err.message };
  }

  // Redis
  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = { status: 'ok' };
  } catch (err: any) {
    checks.redis = { status: 'error', message: err.message };
  }

  // Ollama
  try {
    const ok = await ollamaHealthCheck();
    checks.ollama = { status: ok ? 'ok' : 'unavailable', model: 'qwen3:8b' };
  } catch (err: any) {
    checks.ollama = { status: 'error', message: err.message };
  }

  // SiliconFlow
  checks.siliconflow = {
    qwen_32b: env.QWEN_32B_API_KEY ? 'configured' : 'not_configured',
    qwen_235b: env.QWEN_235B_API_KEY ? 'configured' : 'not_configured',
  };

  // Enrichment APIs
  checks.enrichment = {
    apollo: env.APOLLO_API_KEY ? 'configured' : 'not_configured',
    hunter: env.HUNTER_API_KEY ? 'configured' : 'not_configured',
    snov: (env.SNOV_CLIENT_ID && env.SNOV_CLIENT_SECRET) ? 'configured' : 'not_configured',
    zerobounce: env.ZEROBOUNCE_API_KEY ? 'configured' : 'not_configured',
    brave: env.BRAVE_SEARCH_API_KEY ? 'configured' : 'not_configured',
  };

  const allOk = (checks.mongodb as any)?.status === 'ok' && (checks.redis as any)?.status === 'ok';

  res.status(allOk ? 200 : 503).json({
    service: 'aaziko-buyer-intelligence',
    version: '1.0.0',
    status: allOk ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    checks,
  });
});

export default router;
