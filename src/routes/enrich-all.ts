/**
 * Enrich-All Route
 * Runs the sequential enrichment pipeline on all buyers in batches
 * and stores contact details directly in shortlist_buyer_seller.contact_details[]
 */
import { Router, Request, Response } from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { SequentialEnrichmentAgent } from '../services/agents/sequential-enrichment.agent';

const router = Router();
const MONGO_URI = env.MONGODB_URI;

let jobRunning = false;
let jobProgress = {
  status: 'idle' as 'idle' | 'running' | 'paused' | 'done',
  total: 0,
  processed: 0,
  found_emails: 0,
  found_phones: 0,
  skipped: 0,
  errors: 0,
  started_at: null as Date | null,
  last_updated: null as Date | null,
  current_company: '',
};

function resetProgress(total: number) {
  jobProgress = {
    status: 'running',
    total,
    processed: 0,
    found_emails: 0,
    found_phones: 0,
    skipped: 0,
    errors: 0,
    started_at: new Date(),
    last_updated: new Date(),
    current_company: '',
  };
}

// GET /api/enrich-all/progress
router.get('/progress', (_req: Request, res: Response) => {
  const pct = jobProgress.total > 0
    ? Math.round((jobProgress.processed / jobProgress.total) * 100)
    : 0;
  res.json({ ...jobProgress, percent: pct });
});

// POST /api/enrich-all/stop
router.post('/stop', (_req: Request, res: Response) => {
  if (jobRunning) {
    jobRunning = false;
    jobProgress.status = 'paused';
    res.json({ message: 'Stop signal sent. Current buyer will finish then stop.' });
  } else {
    res.json({ message: 'No job running.' });
  }
});

// POST /api/enrich-all/start
router.post('/start', async (req: Request, res: Response) => {
  if (jobRunning) {
    return res.json({ message: 'Job already running', progress: jobProgress }) as any;
  }

  const { batchSize = 4, country = '', skipExisting = true, limit = 0 } = req.body;

  // Helper: create a fresh MongoDB connection (reconnect on error)
  const newClient = () => new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 30000,
  });

  let client = newClient();

  try {
    await client.connect();
    const db = client.db('Dhruval');

    // ── Recovery: reset buyers stuck in 'running' for >10 min ──────────
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const stuckResult = await db.collection('shortlist_buyer_seller').updateMany(
      { enrichment_status: 'running', enrichment_started_at: { $lt: stuckCutoff } },
      { $set: { enrichment_status: 'error', enrichment_error: 'Stuck — reset by new job start' } }
    );
    if (stuckResult.modifiedCount > 0) {
      logger.info(`[EnrichAll] Reset ${stuckResult.modifiedCount} stuck buyers`);
    }

    // Build filter — skip junk names
    const filter: any = {
      type: 'buyer',
      name: {
        $exists: true,
        $nin: [null, '', 'NULL', 'N/A', 'TO THE', 'TO ORDER'],
        $not: /^TO THE ORDER|^TO THE ORDE|^TO ORDER|^SAME AS|^NULL$|^N\/A$/i,
        $regex: /[a-zA-Z]{3,}/,
      },
    };
    if (country) filter.country = { $regex: country, $options: 'i' };
    if (skipExisting) {
      // Skip done + running + skip; include error buyers for retry
      filter['enrichment_status'] = { $nin: ['done', 'running', 'skip'] };
    }

    // Reset previous errors so they are retried with current pipeline
    const resetResult = await db.collection('shortlist_buyer_seller').updateMany(
      { type: 'buyer', enrichment_status: 'error', enrichment_error: { $not: /Junk buyer name/ } },
      { $set: { enrichment_status: null, enrichment_error: null } }
    );
    if (resetResult.modifiedCount > 0) {
      logger.info(`[EnrichAll] Reset ${resetResult.modifiedCount} previously errored buyers for retry`);
    }

    const countTotal = await db.collection('shortlist_buyer_seller').countDocuments(filter);
    const maxBuyers = limit > 0 ? Math.min(limit, countTotal) : countTotal;

    if (maxBuyers === 0) {
      await client.close();
      return res.json({ message: 'No buyers to enrich (all done or none match filter)', total: 0 }) as any;
    }

    resetProgress(maxBuyers);
    jobRunning = true;

    res.json({
      message: `Enrichment started for ${maxBuyers} buyers in batches of ${batchSize}`,
      total: maxBuyers,
      progress: jobProgress,
    });

    // ── Background: 48-hour stable processing loop ─────────────────────
    setImmediate(async () => {
      const CONCURRENCY = Math.min(parseInt(String(batchSize)), 5);
      const batchSizeN = Math.min(parseInt(String(batchSize)), 20);
      let totalProcessed = 0;

      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([promise, new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s`)), ms)
        )]);

      // Get a healthy DB connection — reconnect if needed
      const getDb = async () => {
        try {
          await client.db('admin').command({ ping: 1 });
          return client.db('Dhruval');
        } catch {
          logger.warn('[EnrichAll] MongoDB ping failed — reconnecting…');
          try { await client.close(); } catch { /* ignore */ }
          client = newClient();
          await client.connect();
          logger.info('[EnrichAll] MongoDB reconnected');
          return client.db('Dhruval');
        }
      };

      const enrichOne = async (buyer: any): Promise<void> => {
        if (!jobRunning) return;
        jobProgress.current_company = buyer.name;
        jobProgress.last_updated = new Date();

        const agent = new SequentialEnrichmentAgent();
        try {
          const activeDb = await getDb();
          await activeDb.collection('shortlist_buyer_seller').updateOne(
            { _id: buyer._id },
            { $set: { enrichment_status: 'running', enrichment_started_at: new Date() } }
          );

          const profile: any = {
            companyName: buyer.name,
            normalizedName: buyer.name,
            country: buyer.country || 'Unknown',
            domain: null,
            tier: 'standard',
            industry: null, subIndustry: null,
            products: buyer.products || [],
            hsCodes: buyer.hsCodes || [],
            contacts: [],
            enrichment: { apollo: null, hunter: null, snov: null, brave: null },
            aiAnalysis: { classification: null, buyingPatterns: null, recommendedApproach: null, model: null, analyzedAt: null },
            tradeStats: {
              totalShipments: buyer.transactionCount || 0,
              totalValue: buyer.totalAmount || 0,
              avgShipmentValue: 0, topOriginCountries: [], topPorts: [],
              dateRange: { first: new Date(), last: new Date() },
              frequency: 'sporadic',
            },
            status: 'raw',
            score: buyer.lead_score || 0,
            createdAt: new Date(), updatedAt: new Date(),
          };

          const result = await withTimeout(agent.enrich(profile), 180000);
          const found = result.contacts_found || [];
          const emails = [...new Set(found.filter((c: any) => c.email).map((c: any) => c.email as string))];
          const phones = [...new Set(found.filter((c: any) => c.phone).map((c: any) => c.phone as string))];
          const linkedins = [...new Set(found.filter((c: any) => c.linkedin).map((c: any) => c.linkedin as string))];
          // Include contacts that have ANY useful info: email, phone, name, or linkedin
          const contact_details = found
            .filter((c: any) => c.email || c.phone || c.name || c.linkedin)
            .map((c: any) => ({
              email: c.email || null, phone: c.phone || null,
              name: c.name || null, position: c.title || c.position || null,
              linkedin: c.linkedin || null, source: c.source || 'pipeline',
            }));

          // Build a per-step summary for the dashboard scraper details panel
          const steps = result.steps || {};
          const googleStep = steps.google || {};
          const globalStep = steps.global || {};
          const apolloStep = steps.apollo || {};
          const enrichment_steps_summary = {
            google: {
              success: googleStep.success !== false,
              results: (googleStep.results || []).length,
              biz_phone: googleStep.business_info?.phone || null,
              biz_website: googleStep.business_info?.website || null,
              biz_address: googleStep.business_info?.address || null,
              emails_found: found.filter((c: any) => c.source === 'search' || c.source === 'google_business').filter((c: any) => c.email).length,
              phones_found: found.filter((c: any) => c.source === 'google_business').filter((c: any) => c.phone).length,
            },
            global: {
              success: globalStep.success !== false,
              pages_scraped: globalStep.data?.stats?.scraped || globalStep.data?.pages_scraped || 0,
              industry: (globalStep.data?.industry || '').replace(/[_,\s]+$/, '').trim() || null,
              description: (globalStep.data?.description || '').replace(/[,\s]+$/, '').trim() || null,
              website: globalStep.data?.website || null,
              address: globalStep.data?.address || null,
              emails_found: found.filter((c: any) => c.source === 'global_api').filter((c: any) => c.email).length,
              phones_found: found.filter((c: any) => c.source === 'global_api').filter((c: any) => c.phone).length,
            },
            apollo: {
              success: apolloStep.success !== false,
              domain: apolloStep.domain || result.domain_found || null,
              org_phone: apolloStep.contacts?.find((c: any) => c.source === 'apollo_org')?.phone || null,
              org_linkedin: apolloStep.contacts?.find((c: any) => c.source === 'apollo_org')?.linkedin || null,
              people: (apolloStep.contacts || [])
                .filter((c: any) => c.source === 'apollo_people')
                .map((c: any) => ({ name: c.name, title: c.title, linkedin: c.linkedin })),
            },
          };

          const writeDb = await getDb();
          await writeDb.collection('shortlist_buyer_seller').updateOne(
            { _id: buyer._id },
            {
              $set: {
                contact_details, primary_email: emails[0] || null,
                all_emails: emails, all_phones: phones, all_linkedins: linkedins,
                domain_found: result.domain_found || null,
                enrichment_status: 'done', enrichment_done_at: new Date(),
                enrichment_steps_summary,
              }
            }
          );

          jobProgress.processed++;
          totalProcessed++;
          jobProgress.found_emails += emails.length;
          jobProgress.found_phones += phones.length;
          jobProgress.last_updated = new Date();
          const namedCount = contact_details.filter((c: any) => c.name).length;
          logger.info(`[EnrichAll] ✓ ${buyer.name} → ${emails.length} emails, ${phones.length} phones, ${namedCount} named contacts`);
        } catch (err: any) {
          logger.error(`[EnrichAll] ✗ ${buyer.name} — ${err.message}`);
          try {
            const errDb = await getDb();
            await errDb.collection('shortlist_buyer_seller').updateOne(
              { _id: buyer._id },
              { $set: { enrichment_status: 'error', enrichment_error: err.message, enrichment_error_at: new Date() } }
            );
          } catch { /* ignore write error */ }
          jobProgress.errors++;
          jobProgress.processed++;
          totalProcessed++;
          jobProgress.last_updated = new Date();
        }
      };

      try {
        let skip = 0;
        let emptyBatchCount = 0;  // detect true completion
        while (jobRunning) {
          if (maxBuyers !== Infinity && totalProcessed >= maxBuyers) break;

          const remaining = maxBuyers === Infinity ? batchSizeN : Math.min(batchSizeN, maxBuyers - totalProcessed);
          if (remaining <= 0) break;

          let buyers: any[];
          try {
            const readDb = await getDb();
            buyers = await readDb.collection('shortlist_buyer_seller')
              .find(filter)
              .sort({ totalAmount: -1 })
              .skip(skip)
              .limit(remaining)
              .toArray();
          } catch (err: any) {
            logger.error(`[EnrichAll] Fetch failed: ${err.message} — retrying in 30s`);
            await new Promise(r => setTimeout(r, 30000));
            continue;
          }

          if (buyers.length === 0) {
            emptyBatchCount++;
            if (emptyBatchCount >= 3) break; // 3 consecutive empty batches = truly done
            await new Promise(r => setTimeout(r, 5000));
            skip = 0;
            continue;
          }
          emptyBatchCount = 0;

          // Run in parallel chunks
          for (let i = 0; i < buyers.length; i += CONCURRENCY) {
            if (!jobRunning) break;
            const chunk = buyers.slice(i, i + CONCURRENCY);
            await Promise.allSettled(chunk.map(enrichOne));
            // Small delay between chunks — avoids rate limits on APIs
            if (jobRunning && i + CONCURRENCY < buyers.length) {
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          // Advance pagination only when NOT skipping existing
          // (skipExisting filter shrinks on its own as buyers become 'done')
          if (skipExisting) {
            skip = 0;
          } else {
            skip += batchSizeN;
          }

          // Heartbeat log every batch
          logger.info(`[EnrichAll] Batch done | processed: ${totalProcessed} | emails: ${jobProgress.found_emails} | errors: ${jobProgress.errors}`);
        }

        jobProgress.status = jobRunning ? 'done' : 'paused';
        jobProgress.current_company = '';
        jobRunning = false;
        logger.info(`[EnrichAll] ✅ Job complete. Total: ${jobProgress.processed}, Emails: ${jobProgress.found_emails}, Errors: ${jobProgress.errors}`);
      } catch (err: any) {
        logger.error('[EnrichAll] Fatal error in main loop', { error: err.message });
        jobProgress.status = 'paused';
        jobRunning = false;
      } finally {
        try { await client.close(); } catch { /* ignore */ }
      }
    });

    return;
  } catch (err: any) {
    try { await client.close(); } catch { /* ignore */ }
    jobRunning = false;
    res.status(500).json({ error: err.message });
  }
});

export default router;
