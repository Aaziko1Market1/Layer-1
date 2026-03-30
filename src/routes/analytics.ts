import { Router, Request, Response } from 'express';
import { getBuyerDb } from '../config/mongodb';
import { logger } from '../config/logger';
import { runPipeline } from '../services/etl/pipeline';
import { ETLRunSchema } from '../types';

const router = Router();

// GET /api/analytics/pipeline — Pipeline status summary
router.get('/pipeline', async (_req: Request, res: Response) => {
  try {
    const db = getBuyerDb();
    const col = db.collection('buyer_profiles');

    const [statusCounts, lastRun, totalContacts] = await Promise.all([
      col.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      db.collection('audit_log')
        .find({ action: { $in: ['etl_extract', 'etl_classify'] } })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray(),
      col.aggregate([
        { $project: { contactCount: { $size: { $ifNull: ['$contacts', []] } } } },
        { $group: { _id: null, total: { $sum: '$contactCount' } } },
      ]).toArray(),
    ]);

    const stats = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
    const total = Object.values(stats).reduce((a: number, b: unknown) => a + (b as number), 0);

    res.json({
      profiles: {
        total,
        raw: stats.raw || 0,
        extracted: stats.extracted || 0,
        classified: stats.classified || 0,
        enriched: stats.enriched || 0,
        verified: stats.verified || 0,
        ready: stats.ready || 0,
      },
      totalContacts: totalContacts[0]?.total || 0,
      lastRunAt: lastRun[0]?.createdAt || null,
    });
  } catch (err: any) {
    logger.error('Pipeline analytics failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/run-etl — Trigger ETL pipeline
router.post('/run-etl', async (req: Request, res: Response) => {
  try {
    const params = ETLRunSchema.parse(req.body);
    logger.info('Manual ETL run triggered', params);

    // Run async — don't block the response
    const resultPromise = runPipeline({
      country: params.country,
      extractLimit: params.limit,
      classifyLimit: Math.min(params.limit, 100),
      verifyLimit: Math.min(params.limit, 50), // Verify up to 50 websites
      skipExisting: params.skipExisting,
      skipVerification: false, // Always run verification
    });

    // Return immediately with acknowledgment
    res.json({ status: 'started', message: 'ETL pipeline started (Extract → Classify → Verify). Check /api/analytics/pipeline for progress.' });

    // Let it run in background
    resultPromise
      .then((result) => logger.info('ETL run completed', result))
      .catch((err) => logger.error('ETL run failed', { error: err.message }));
  } catch (err: any) {
    logger.error('ETL trigger failed', { error: err.message });
    res.status(err.name === 'ZodError' ? 400 : 500).json({ error: err.message });
  }
});

// GET /api/analytics/enrichment — Enrichment coverage stats
router.get('/enrichment', async (_req: Request, res: Response) => {
  try {
    const db = getBuyerDb();
    const col = db.collection('buyer_profiles');

    const [withDomain, withContacts, withApollo, withHunter, avgScore] = await Promise.all([
      col.countDocuments({ domain: { $ne: null } }),
      col.countDocuments({ 'contacts.0': { $exists: true } }),
      col.countDocuments({ 'enrichment.apollo.status': 'success' }),
      col.countDocuments({ 'enrichment.hunter.status': 'success' }),
      col.aggregate([
        { $match: { score: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$score' }, max: { $max: '$score' }, min: { $min: '$score' } } },
      ]).toArray(),
    ]);

    const total = await col.countDocuments();
    const scoreStats = avgScore[0] || { avg: 0, max: 0, min: 0 };

    res.json({
      total,
      withDomain,
      withContacts,
      enrichmentCoverage: {
        apollo: withApollo,
        hunter: withHunter,
      },
      domainCoveragePercent: total > 0 ? ((withDomain / total) * 100).toFixed(1) : '0',
      contactCoveragePercent: total > 0 ? ((withContacts / total) * 100).toFixed(1) : '0',
      scoreStats: {
        avg: Math.round(scoreStats.avg || 0),
        max: scoreStats.max || 0,
        min: scoreStats.min || 0,
      },
    });
  } catch (err: any) {
    logger.error('Enrichment analytics failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/audit — Recent audit log
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const db = getBuyerDb();
    const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 50);

    const logs = await db.collection('audit_log')
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ data: logs });
  } catch (err: any) {
    logger.error('Audit log fetch failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
