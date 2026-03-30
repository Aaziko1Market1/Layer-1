import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { getBuyerDb } from '../../config/mongodb';
import { queueEnrichment } from '../queue/worker';

/**
 * Batch Processing + Pipeline Orchestrator.
 * Manages bulk enrichment runs with daily limits and progress tracking.
 */
export class BatchOrchestrator {
  private dailyLimit: number;

  constructor() {
    this.dailyLimit = env.DAILY_RESEARCH_LIMIT;
  }

  async runBatch(options: {
    tier?: string;
    country?: string;
    limit?: number;
    action?: 'enrich' | 'analyze' | 'full';
  } = {}): Promise<{ queued: number; skipped: number }> {
    const db = getBuyerDb();
    const limit = Math.min(options.limit || 100, this.dailyLimit);
    const action = options.action || 'full';

    const filter: Record<string, unknown> = { enrichment_status: 'raw' };
    if (options.tier) filter.buyer_tier = options.tier;
    if (options.country) filter.country = options.country;

    const buyers = await db.collection('buyer_profiles')
      .find(filter)
      .sort({ total_trade_volume_usd: -1 })
      .limit(limit)
      .project({ _id: 1 })
      .toArray();

    if (buyers.length === 0) {
      logger.info('BatchOrchestrator: no buyers to process');
      return { queued: 0, skipped: 0 };
    }

    const ids = buyers.map(b => b._id.toString());
    const jobIds = await queueEnrichment(ids, action, 5);

    logger.info('BatchOrchestrator: batch queued', {
      queued: jobIds.length,
      tier: options.tier,
      country: options.country,
      action,
    });

    return { queued: jobIds.length, skipped: 0 };
  }

  async getProgress(): Promise<{
    total: number;
    raw: number;
    enriched: number;
    verified: number;
    ready: number;
    daily_remaining: number;
  }> {
    const db = getBuyerDb();
    const col = db.collection('buyer_profiles');
    const [total, raw, enriched, verified, ready] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ enrichment_status: 'raw' }),
      col.countDocuments({ enrichment_status: 'enriched' }),
      col.countDocuments({ enrichment_status: 'verified' }),
      col.countDocuments({ enrichment_status: 'ready' }),
    ]);

    return { total, raw, enriched, verified, ready, daily_remaining: this.dailyLimit };
  }
}
