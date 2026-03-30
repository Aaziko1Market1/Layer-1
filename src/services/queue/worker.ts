import { Queue, Worker, Job } from 'bullmq';
import { ObjectId } from 'mongodb';
import { getBuyerDb } from '../../config/mongodb';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { enrichBuyer } from '../enrichment/manager';
import { analyzeBuyerDeep } from '../ai/router';
import type { BuyerProfile } from '../../types';

function redisOpts() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

const QUEUE_NAME = 'buyer-enrichment';

let queue: Queue | null = null;
let worker: Worker | null = null;

export function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(QUEUE_NAME, { connection: redisOpts() });
  return queue;
}

export function startWorker(concurrency = 2): Worker {
  if (worker) return worker;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { buyerProfileId, action } = job.data;
      const db = getBuyerDb();

      logger.info('Processing job', { jobId: job.id, action, buyerProfileId });

      const profile = await db.collection<BuyerProfile>('buyer_profiles').findOne({
        _id: new ObjectId(buyerProfileId),
      });

      if (!profile) {
        throw new Error(`Buyer profile ${buyerProfileId} not found`);
      }

      switch (action) {
        case 'enrich': {
          await enrichBuyer(profile);
          break;
        }
        case 'analyze': {
          const tradeData = {
            totalShipments: profile.tradeStats.totalShipments,
            totalValue: profile.tradeStats.totalValue,
            frequency: profile.tradeStats.frequency,
            topOriginCountries: profile.tradeStats.topOriginCountries,
            products: profile.products.slice(0, 10),
          };
          const enrichmentData = {
            apollo: profile.enrichment.apollo?.data || {},
            contactCount: profile.contacts.length,
            domain: profile.domain,
          };

          const analysis = await analyzeBuyerDeep(profile.companyName, tradeData, enrichmentData);

          let parsedAnalysis: Record<string, unknown> = {};
          try {
            const jsonMatch = analysis.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedAnalysis = JSON.parse(jsonMatch[0]);
          } catch {
            parsedAnalysis = { raw: analysis.content };
          }

          const score = (parsedAnalysis.score as number) || profile.score;
          await db.collection('buyer_profiles').updateOne(
            { _id: profile._id },
            {
              $set: {
                'aiAnalysis.buyingPatterns': JSON.stringify(parsedAnalysis.buyingBehavior || {}),
                'aiAnalysis.recommendedApproach': JSON.stringify(parsedAnalysis.outreachStrategy || {}),
                'aiAnalysis.model': analysis.model,
                'aiAnalysis.analyzedAt': new Date(),
                score,
                status: 'verified',
                updatedAt: new Date(),
              },
            }
          );
          break;
        }
        case 'full': {
          // Full pipeline: enrich → analyze
          const enriched = await enrichBuyer(profile);

          const tradeData = {
            totalShipments: enriched.tradeStats.totalShipments,
            totalValue: enriched.tradeStats.totalValue,
            frequency: enriched.tradeStats.frequency,
            topOriginCountries: enriched.tradeStats.topOriginCountries,
            products: enriched.products.slice(0, 10),
          };
          const enrichmentData = {
            apollo: enriched.enrichment.apollo?.data || {},
            hunter: enriched.enrichment.hunter?.data || {},
            contactCount: enriched.contacts.length,
            domain: enriched.domain,
          };

          const analysis = await analyzeBuyerDeep(enriched.companyName, tradeData, enrichmentData);

          let parsedAnalysis: Record<string, unknown> = {};
          try {
            const jsonMatch = analysis.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedAnalysis = JSON.parse(jsonMatch[0]);
          } catch {
            parsedAnalysis = { raw: analysis.content };
          }

          const score = (parsedAnalysis.score as number) || enriched.score;
          await db.collection('buyer_profiles').updateOne(
            { _id: enriched._id },
            {
              $set: {
                'aiAnalysis.buyingPatterns': JSON.stringify(parsedAnalysis.buyingBehavior || {}),
                'aiAnalysis.recommendedApproach': JSON.stringify(parsedAnalysis.outreachStrategy || {}),
                'aiAnalysis.model': analysis.model,
                'aiAnalysis.analyzedAt': new Date(),
                score,
                status: 'ready',
                updatedAt: new Date(),
              },
            }
          );
          break;
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      logger.info('Job completed', { jobId: job.id, action, buyerProfileId });
    },
    {
      connection: redisOpts(),
      concurrency,
      limiter: { max: 5, duration: 60_000 },
    }
  );

  worker.on('completed', (job) => {
    logger.debug('Job finished', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Enrichment worker started', { concurrency });
  return worker;
}

// Queue helper functions
export async function queueEnrichment(buyerProfileIds: string[], action: 'enrich' | 'analyze' | 'full' = 'full', priority = 5): Promise<string[]> {
  const q = getQueue();
  const jobIds: string[] = [];

  for (const buyerProfileId of buyerProfileIds) {
    const job = await q.add(
      `${action}-${buyerProfileId}`,
      { buyerProfileId, action },
      { priority, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );
    if (job.id) jobIds.push(job.id);
  }

  logger.info('Queued enrichment jobs', { count: buyerProfileIds.length, action });
  return jobIds;
}

export async function getQueueStats() {
  const q = getQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  logger.info('Worker stopped');
}
