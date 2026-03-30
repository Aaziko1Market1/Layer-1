import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getBuyerDb } from '../config/mongodb';
import { logger } from '../config/logger';
import { getQueueStats } from '../services/queue/worker';

const router = Router();

// GET /api/jobs — List enrichment jobs
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getBuyerDb();
    const { status, page = '1', limit = '20' } = req.query;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      db.collection('enrichment_jobs')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('enrichment_jobs').countDocuments(filter),
    ]);

    res.json({
      data: jobs,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err: any) {
    logger.error('List jobs failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/queue-stats — BullMQ queue statistics
router.get('/queue-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err: any) {
    logger.error('Queue stats failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id — Get single job
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getBuyerDb();
    const job = await db.collection('enrichment_jobs').findOne({ _id: new ObjectId(req.params.id) });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(job);
  } catch (err: any) {
    logger.error('Get job failed', { id: req.params.id, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
