import { getBuyerDb } from '../../config/mongodb';
import { logger } from '../../config/logger';
import { CompanyResearchAgent } from '../agents/company-research.agent';
import { ContactDiscoveryAgent } from '../agents/contact-discovery.agent';
import { VerificationAgent } from '../agents/verification.agent';
import { BuyerIntelligenceAgent } from '../agents/buyer-intelligence.agent';
import { SequentialEnrichmentAgent } from '../agents/sequential-enrichment.agent';
import type { BuyerProfile } from '../../types';

export interface AgentRunnerOptions {
  limit?: number;
  batchSize?: number;
}

/**
 * Run Company Research Agent (Agent 1)
 */
export async function runCompanyResearch(
  options: AgentRunnerOptions = {}
): Promise<{ researched: number; failed: number }> {
  const { limit = 100, batchSize = 3 } = options;
  const db = getBuyerDb();
  const agent = new CompanyResearchAgent();

  logger.info('=== Company Research Starting ===', { limit, batchSize });

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: { $in: ['classified', 'website_verified'] } })
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles to research');
    return { researched: 0, failed: 0 };
  }

  let researched = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    for (const profile of batch) {
      try {
        const companyResearch = await agent.research(profile);

        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              company_research: companyResearch,
              'step_data.agent1_company_research': {
                step_name: 'Agent 1: Company Research',
                data: companyResearch,
                received_at: new Date(),
              },
              status: 'researched',
              updatedAt: new Date(),
            },
          }
        );

        researched++;
      } catch (err: any) {
        failed++;
        logger.error('Company research failed', {
          buyer: profile.companyName,
          error: err.message,
        });
      }
    }

    // Progress logging
    if ((i + batchSize) % 10 === 0 || i + batchSize >= profiles.length) {
      logger.info('Company research progress', {
        researched,
        failed,
        total: profiles.length,
      });
    }

    // Delay between batches
    if (i + batchSize < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Audit log
  await db.collection('audit_log').insertOne({
    action: 'agent_company_research',
    entityType: 'etl_run',
    entityId: `research_${Date.now()}`,
    details: { researched, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Company Research Complete ===', { researched, failed });
  return { researched, failed };
}

/**
 * Run Contact Discovery Agent (Agent 2)
 */
export async function runContactDiscovery(
  options: AgentRunnerOptions = {}
): Promise<{ discovered: number; notFound: number; failed: number }> {
  const { limit = 100, batchSize = 3 } = options;
  const db = getBuyerDb();
  const agent = new ContactDiscoveryAgent();

  logger.info('=== Contact Discovery Starting ===', { limit, batchSize });

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: 'researched' })
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles for contact discovery');
    return { discovered: 0, notFound: 0, failed: 0 };
  }

  let discovered = 0;
  let notFound = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    for (const profile of batch) {
      try {
        const result = await agent.discover(profile);

        const status = result.contacts.length > 0 ? 'contact_found' : 'contact_not_found';

        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              contacts: result.contacts,
              best_contact_index: result.best_contact_index,
              'step_data.agent2_contact_discovery': {
                step_name: 'Agent 2: Contact Discovery',
                data: { contacts_found: result.contacts.length, best_contact_index: result.best_contact_index },
                received_at: new Date(),
              },
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.contacts.length > 0) {
          discovered++;
        } else {
          notFound++;
        }
      } catch (err: any) {
        failed++;
        logger.error('Contact discovery failed', {
          buyer: profile.companyName,
          error: err.message,
        });
      }
    }

    // Progress logging
    if ((i + batchSize) % 10 === 0 || i + batchSize >= profiles.length) {
      logger.info('Contact discovery progress', {
        discovered,
        notFound,
        failed,
        total: profiles.length,
      });
    }

    // Delay between batches
    if (i + batchSize < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Audit log
  await db.collection('audit_log').insertOne({
    action: 'agent_contact_discovery',
    entityType: 'etl_run',
    entityId: `contacts_${Date.now()}`,
    details: { discovered, notFound, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Contact Discovery Complete ===', { discovered, notFound, failed });
  return { discovered, notFound, failed };
}

/**
 * Run Verification Agent (Agent 3)
 */
export async function runVerification(
  options: AgentRunnerOptions = {}
): Promise<{ verified: number; failed: number }> {
  const { limit = 100, batchSize = 5 } = options;
  const db = getBuyerDb();
  const agent = new VerificationAgent();

  logger.info('=== Verification Starting ===', { limit, batchSize });

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: { $in: ['contact_found', 'contact_not_found'] } })
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles for verification');
    return { verified: 0, failed: 0 };
  }

  let verified = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    for (const profile of batch) {
      try {
        const companyResearch = (profile as any).company_research || {};
        const contacts = (profile.contacts || []).map((c: any) => ({
          name: c.name || 'Unknown',
          title: c.title || 'Unknown',
          email: c.email,
          email_verified: c.emailVerified || c.email_verified || false,
          email_status: c.email_status || 'unknown',
          email_confidence: c.email_confidence || 0.5,
          email_source: c.email_source || c.source || 'website',
          linkedin: c.linkedin || null,
          phone: c.phone || null,
          phone_verified: c.phone_verified || false,
          role_relevance_score: c.role_relevance_score || 50,
        }));

        const confidence = await agent.verify(profile, companyResearch, contacts);

        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              confidence,
              'step_data.agent3_verification': {
                step_name: 'Agent 3: Verification',
                data: confidence,
                received_at: new Date(),
              },
              status: 'verified',
              updatedAt: new Date(),
            },
          }
        );

        verified++;
      } catch (err: any) {
        failed++;
        logger.error('Verification failed', {
          buyer: profile.companyName,
          error: err.message,
        });
      }
    }

    // Progress logging
    if ((i + batchSize) % 10 === 0 || i + batchSize >= profiles.length) {
      logger.info('Verification progress', {
        verified,
        failed,
        total: profiles.length,
      });
    }

    // Small delay between batches
    if (i + batchSize < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Audit log
  await db.collection('audit_log').insertOne({
    action: 'agent_verification',
    entityType: 'etl_run',
    entityId: `verification_${Date.now()}`,
    details: { verified, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Verification Complete ===', { verified, failed });
  return { verified, failed };
}

/**
 * Run Buyer Intelligence Agent (Agent 4)
 */
export async function runBuyerIntelligence(
  options: AgentRunnerOptions = {}
): Promise<{ generated: number; failed: number }> {
  const { limit = 100, batchSize = 3 } = options;
  const db = getBuyerDb();
  const agent = new BuyerIntelligenceAgent();

  logger.info('=== Buyer Intelligence Starting ===', { limit, batchSize });

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: 'verified' })
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles for intelligence generation');
    return { generated: 0, failed: 0 };
  }

  let generated = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    for (const profile of batch) {
      try {
        const companyResearch = (profile as any).company_research || {};
        const contacts = (profile.contacts || []).map((c: any) => ({
          name: c.name || 'Unknown',
          title: c.title || 'Unknown',
          email: c.email,
          email_verified: c.emailVerified || c.email_verified || false,
          email_status: c.email_status || 'unknown',
          email_confidence: c.email_confidence || 0.5,
          email_source: c.email_source || c.source || 'website',
          linkedin: c.linkedin || null,
          phone: c.phone || null,
          phone_verified: c.phone_verified || false,
          role_relevance_score: c.role_relevance_score || 50,
        }));
        const confidence = (profile as any).confidence || {};

        const result = await agent.generateIntelligence(
          profile,
          companyResearch,
          contacts,
          confidence
        );

        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              intelligence: result.intelligence,
              mention_policy: result.mention_policy,
              channel_eligibility: result.channel_eligibility,
              qualification: result.qualification,
              'step_data.agent4_buyer_intelligence': {
                step_name: 'Agent 4: Buyer Intelligence',
                data: {
                  intelligence: result.intelligence,
                  qualification: result.qualification,
                  channel_eligibility: result.channel_eligibility,
                },
                received_at: new Date(),
              },
              status: 'ready',
              updatedAt: new Date(),
            },
          }
        );

        generated++;
      } catch (err: any) {
        failed++;
        logger.error('Intelligence generation failed', {
          buyer: profile.companyName,
          error: err.message,
        });
      }
    }

    // Progress logging
    if ((i + batchSize) % 10 === 0 || i + batchSize >= profiles.length) {
      logger.info('Intelligence generation progress', {
        generated,
        failed,
        total: profiles.length,
      });
    }

    // Delay between batches
    if (i + batchSize < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Audit log
  await db.collection('audit_log').insertOne({
    action: 'agent_buyer_intelligence',
    entityType: 'etl_run',
    entityId: `intelligence_${Date.now()}`,
    details: { generated, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Buyer Intelligence Complete ===', { generated, failed });
  return { generated, failed };
}


/**
 * Run Sequential Enrichment (NEW - All APIs in sequence)
 * Google → Global → Brave → AI → Apollo → Hunter → Snov → ZeroBounce (mandatory)
 */
export async function runSequentialEnrichment(
  options: AgentRunnerOptions = {}
): Promise<{ enriched: number; failed: number }> {
  const { limit = 100, batchSize = 1 } = options; // batchSize=1 for sequential processing
  const db = getBuyerDb();
  const agent = new SequentialEnrichmentAgent();

  logger.info('=== Sequential Enrichment Starting ===', { limit, batchSize });

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: { $in: ['classified', 'website_verified', 'extracted'] } })
    .sort({ score: -1 })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles for sequential enrichment');
    return { enriched: 0, failed: 0 };
  }

  let enriched = 0;
  let failed = 0;

  // Process one by one (sequential)
  for (const profile of profiles) {
    try {
      logger.info(`\n${'='.repeat(80)}`);
      logger.info(`Processing: ${profile.companyName} (${enriched + 1}/${profiles.length})`);
      logger.info(`${'='.repeat(80)}\n`);

      const enrichmentData = await agent.enrich(profile);

      // Store enrichment data with step-wise breakdown
      const updateFields: Record<string, any> = {
        sequential_enrichment: enrichmentData,
        stopped_at_step: enrichmentData.stopped_at_step || null,
        status: enrichmentData.status === 'complete' ? 'enriched' : 'enrichment_failed',
        updatedAt: new Date(),
      };

      // Store domain if found
      if (enrichmentData.domain_found) {
        updateFields.domain = enrichmentData.domain_found;
      }

      // Store contacts if found
      if (enrichmentData.contacts_found?.length > 0) {
        updateFields.contacts = enrichmentData.contacts_found.map((c: any) => ({
          name: c.name || null,
          title: c.title || null,
          email: c.email || null,
          emailVerified: false,
          phone: c.phone || null,
          linkedin: c.linkedin || null,
          website: c.website || null,
          address: c.address || null,
          source: c.source || 'unknown',
          discoveredAt: new Date(),
        }));
      }

      // Mark verified emails from ZeroBounce
      if (enrichmentData.steps?.zerobounce?.verified && updateFields.contacts) {
        const validEmails = new Set(
          enrichmentData.steps.zerobounce.verified
            .filter((v: any) => v.valid)
            .map((v: any) => v.email?.toLowerCase())
        );
        updateFields.contacts = updateFields.contacts.map((c: any) => ({
          ...c,
          emailVerified: c.email ? validEmails.has(c.email.toLowerCase()) : false,
        }));
      }

      // Store each step's data separately for easy querying
      if (enrichmentData.steps) {
        if (enrichmentData.steps.google) {
          updateFields['step_data.google_scraper'] = {
            step_name: 'Step 1: Google Scraper API',
            data: enrichmentData.steps.google,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.global) {
          updateFields['step_data.global_api'] = {
            step_name: 'Step 2: Global API',
            data: enrichmentData.steps.global,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.brave) {
          updateFields['step_data.brave_search'] = {
            step_name: 'Step 3: Brave Search API',
            data: enrichmentData.steps.brave,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.ai) {
          updateFields['step_data.ai_analysis'] = {
            step_name: 'Step 4: AI Analysis',
            data: enrichmentData.steps.ai,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.apollo) {
          updateFields['step_data.apollo'] = {
            step_name: 'Step 5: Apollo API',
            data: enrichmentData.steps.apollo,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.hunter) {
          updateFields['step_data.hunter'] = {
            step_name: 'Step 6: Hunter.io API',
            data: enrichmentData.steps.hunter,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.snov) {
          updateFields['step_data.snov'] = {
            step_name: 'Step 7: Snov API',
            data: enrichmentData.steps.snov,
            received_at: new Date(),
          };
        }
        if (enrichmentData.steps.zerobounce) {
          updateFields['step_data.zerobounce'] = {
            step_name: 'Step 8: ZeroBounce API',
            data: enrichmentData.steps.zerobounce,
            received_at: new Date(),
          };
        }
      }

      await db.collection('buyer_profiles').updateOne(
        { _id: profile._id },
        { $set: updateFields }
      );

      if (enrichmentData.status === 'complete') {
        enriched++;
        logger.info(`✅ SUCCESS: ${profile.companyName} enriched successfully\n`);
      } else {
        failed++;
        logger.error(`❌ FAILED: ${profile.companyName} enrichment failed\n`);
      }

    } catch (err: any) {
      failed++;
      logger.error('Sequential enrichment failed', {
        buyer: profile.companyName,
        error: err.message,
      });
    }

    // Delay between profiles (rate limiting)
    if (enriched + failed < profiles.length) {
      logger.info('Waiting 3 seconds before next profile...\n');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  // Audit log
  await db.collection('audit_log').insertOne({
    action: 'sequential_enrichment',
    entityType: 'etl_run',
    entityId: `sequential_${Date.now()}`,
    details: { enriched, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Sequential Enrichment Complete ===', { enriched, failed });
  return { enriched, failed };
}
