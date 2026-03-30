import { connectMongo, disconnectMongo } from '../../config/mongodb';
import { logger } from '../../config/logger';
import { extractImporters } from './extractor';
import { classifyProfiles } from './classifier';
import { verifyWebsites } from './verifier';
import {
  runCompanyResearch,
  runContactDiscovery,
  runVerification,
  runBuyerIntelligence,
  runSequentialEnrichment,
} from './agent-runner';
import { storeEnrichedBuyers } from './enriched-storage';

export interface PipelineOptions {
  country?: string;
  extractLimit?: number;
  classifyLimit?: number;
  verifyLimit?: number;
  agentLimit?: number;
  skipExisting?: boolean;
  skipVerification?: boolean;
  skipAgents?: boolean; // Skip 4-agent system (for backward compatibility)
  useSequential?: boolean; // Use new sequential enrichment (Google→Global→Brave→AI→Apollo→Hunter→Snov→ZeroBounce)
}

/**
 * Full ETL pipeline: Extract → Classify → Verify → 4-Agent System → Enriched Storage
 * 
 * 9 Steps:
 * 1. Extract importers from trade data
 * 2. Classify with AI
 * 3. Verify websites (optional)
 * 4. Company Research (Agent 1)
 * 5. Contact Discovery (Agent 2)
 * 6. Verification (Agent 3)
 * 7. Buyer Intelligence (Agent 4)
 * 8. Deduplication + QA Sampling
 * 9. Enriched Storage
 */
export async function runPipeline(options: PipelineOptions = {}): Promise<{
  extraction: { extracted: number; skipped: number };
  classification: { classified: number; failed: number };
  verification: { verified: number; failed: number; skipped: number };
  companyResearch?: { researched: number; failed: number };
  contactDiscovery?: { discovered: number; notFound: number; failed: number };
  agentVerification?: { verified: number; failed: number };
  intelligence?: { generated: number; failed: number };
  enrichedStorage?: { stored: number; dedupBlocked: number; qaPending: number; failed: number };
  sequentialEnrichment?: { enriched: number; failed: number };
  durationMs: number;
}> {
  const start = Date.now();

  logger.info('=== ETL Pipeline Starting ===', options);

  // Step 1: Extract importers from trade data
  const extraction = await extractImporters({
    country: options.country,
    limit: options.extractLimit || 1000,
    skipExisting: options.skipExisting ?? true,
  });

  // Step 2: Classify extracted profiles using AI
  const classification = await classifyProfiles({
    limit: options.classifyLimit || 100,
    batchSize: 5,
  });

  // Step 3: Verify websites (optional, can be skipped for faster testing)
  let verification = { verified: 0, failed: 0, skipped: 0 };
  if (!options.skipVerification) {
    verification = await verifyWebsites({
      limit: options.verifyLimit || 50,
      batchSize: 3,
    });
  } else {
    logger.info('Website verification skipped (skipVerification=true)');
  }

  // Steps 4-9: Choose between Sequential or 4-Agent System
  let companyResearch, contactDiscovery, agentVerification, intelligence, enrichedStorage, sequentialEnrichment;

  if (options.useSequential) {
    // NEW: Sequential Enrichment (Google→Global→Brave→AI→Apollo→Hunter→Snov→ZeroBounce)
    logger.info('Using SEQUENTIAL enrichment mode');
    sequentialEnrichment = await runSequentialEnrichment({
      limit: options.agentLimit || 50,
      batchSize: 1, // Process one at a time
    });
  } else if (!options.skipAgents) {
    // OLD: 4-Agent System
    logger.info('Using 4-AGENT system mode');
    const agentLimit = options.agentLimit || 50;

    // Step 4: Company Research (Agent 1)
    companyResearch = await runCompanyResearch({
      limit: agentLimit,
      batchSize: 3,
    });

    // Step 5: Contact Discovery (Agent 2)
    contactDiscovery = await runContactDiscovery({
      limit: agentLimit,
      batchSize: 3,
    });

    // Step 6: Verification (Agent 3)
    agentVerification = await runVerification({
      limit: agentLimit,
      batchSize: 5,
    });

    // Step 7: Buyer Intelligence (Agent 4)
    intelligence = await runBuyerIntelligence({
      limit: agentLimit,
      batchSize: 3,
    });

    // Step 8-9: Deduplication + QA + Enriched Storage
    enrichedStorage = await storeEnrichedBuyers({
      limit: agentLimit,
    });
  } else {
    logger.info('4-Agent system skipped (skipAgents=true)');
  }

  const durationMs = Date.now() - start;
  logger.info('=== ETL Pipeline Complete ===', {
    extraction,
    classification,
    verification,
    companyResearch,
    contactDiscovery,
    agentVerification,
    intelligence,
    enrichedStorage,
    sequentialEnrichment,
    durationMs,
    durationSec: (durationMs / 1000).toFixed(1),
  });

  return {
    extraction,
    classification,
    verification,
    companyResearch,
    contactDiscovery,
    agentVerification,
    intelligence,
    enrichedStorage,
    sequentialEnrichment,
    durationMs,
  };
}

// CLI entry point
if (require.main === module) {
  (async () => {
    try {
      await connectMongo();
      const result = await runPipeline({
        extractLimit: parseInt(process.argv[2] || '500', 10),
        classifyLimit: parseInt(process.argv[3] || '50', 10),
        verifyLimit: parseInt(process.argv[4] || '25', 10),
        agentLimit: parseInt(process.argv[5] || '25', 10),
        skipVerification: process.argv.includes('--skip-verify'),
        skipAgents: process.argv.includes('--skip-agents'),
        useSequential: process.argv.includes('--sequential'), // NEW FLAG
      });
      console.log('Pipeline result:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Pipeline failed:', err);
      process.exit(1);
    } finally {
      await disconnectMongo();
    }
  })();
}
