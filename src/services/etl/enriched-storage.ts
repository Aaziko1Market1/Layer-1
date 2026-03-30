import { ObjectId } from 'mongodb';
import { getBuyerDb } from '../../config/mongodb';
import { logger } from '../../config/logger';
import { DeduplicationService } from '../dedup/index';
import { QAService } from '../dedup/qa.service';
import type { BuyerProfile, EnrichedBuyer, PipelineState } from '../../types';
import type { CompanyResearch } from '../agents/company-research.agent';
import type { Contact } from '../agents/contact-discovery.agent';
import type { IntelligenceResult } from '../agents/buyer-intelligence.agent';
import type { ConfidenceScores } from '../../types';

export interface EnrichedStorageOptions {
  limit?: number;
}

export interface EnrichedStorageResult {
  stored: number;
  dedupBlocked: number;
  qaPending: number;
  failed: number;
}

/**
 * Transform buyer_profiles to enriched_buyers and store
 * Includes deduplication and QA sampling
 */
export async function storeEnrichedBuyers(
  options: EnrichedStorageOptions = {}
): Promise<EnrichedStorageResult> {
  const { limit = 100 } = options;
  const db = getBuyerDb();
  const dedupService = new DeduplicationService();
  const qaService = new QAService();

  logger.info('=== Enriched Storage Starting ===', { limit });

  // Find buyer_profiles with status="ready" (completed all 4 agents)
  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: 'ready' })
    .limit(limit)
    .toArray();

  if (profiles.length === 0) {
    logger.info('No profiles ready for enriched storage');
    return { stored: 0, dedupBlocked: 0, qaPending: 0, failed: 0 };
  }

  logger.info('Found profiles ready for enriched storage', { count: profiles.length });

  let stored = 0;
  let dedupBlocked = 0;
  let qaPending = 0;
  let failed = 0;

  for (const profile of profiles) {
    try {
      // Step 1: Deduplication check
      const dedupDecision = await dedupService.checkDuplicate(profile._id!, {
        domain: profile.domain,
        normalizedName: profile.normalizedName,
        country: profile.country,
        parentCompany: profile.websiteTrust?.subsidiary?.parentCompany || null,
        contactEmails: profile.contacts.map((c) => c.email),
      });

      if (dedupDecision.decision === 'blocked') {
        logger.info('Buyer blocked by deduplication', {
          buyer: profile.companyName,
          reason: dedupDecision.reason,
        });

        // Update status to duplicate_blocked
        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              status: 'duplicate_blocked',
              updatedAt: new Date(),
            },
          }
        );

        dedupBlocked++;
        continue;
      }

      // Step 2: Transform to enriched_buyers
      const enrichedBuyer = await transformToEnrichedBuyer(profile);

      // Step 3: QA Sampling
      const shouldSample = qaService.shouldSample();
      if (shouldSample) {
        enrichedBuyer.pipeline_state = 'qa_pending';
        enrichedBuyer.qa.sampled = true;
        qaPending++;
      } else {
        enrichedBuyer.pipeline_state = determinePipelineState(profile, enrichedBuyer);
        enrichedBuyer.qa.sampled = false;
      }

      // Step 4: Insert into enriched_buyers
      await db.collection('enriched_buyers').insertOne(enrichedBuyer);

      // Step 5: Update buyer_profiles status
      await db.collection('buyer_profiles').updateOne(
        { _id: profile._id },
        {
          $set: {
            status: 'enriched',
            updatedAt: new Date(),
          },
        }
      );

      stored++;
      logger.debug('Enriched buyer stored', {
        buyer: profile.companyName,
        pipeline_state: enrichedBuyer.pipeline_state,
      });
    } catch (err: any) {
      failed++;
      logger.error('Failed to store enriched buyer', {
        buyer: profile.companyName,
        error: err.message,
      });
    }
  }

  // Create audit log
  await db.collection('audit_log').insertOne({
    action: 'enriched_storage',
    entityType: 'etl_run',
    entityId: `enriched_${Date.now()}`,
    details: { stored, dedupBlocked, qaPending, failed, limit },
    createdAt: new Date(),
  });

  logger.info('=== Enriched Storage Complete ===', {
    stored,
    dedupBlocked,
    qaPending,
    failed,
  });

  return { stored, dedupBlocked, qaPending, failed };
}

/**
 * Transform buyer_profiles to enriched_buyers
 */
async function transformToEnrichedBuyer(profile: BuyerProfile): Promise<EnrichedBuyer> {
  const now = new Date();

  // Extract agent outputs from profile (stored during agent execution)
  const companyResearch = (profile as any).company_research;
  const contacts = profile.contacts;
  const confidence = (profile as any).confidence;
  const intelligence = (profile as any).intelligence;
  const mentionPolicy = (profile as any).mention_policy;
  const channelEligibility = (profile as any).channel_eligibility;
  const qualification = (profile as any).qualification;

  const enrichedBuyer: EnrichedBuyer = {
    original_buyer_id: profile._id!,

    verified_company: {
      name: profile.companyName,
      domain: profile.domain,
      country: profile.country,
      address: profile.websiteTrust?.extractedData?.officeLocations?.[0] || '',
      confidence: confidence?.company || 'low',
    },

    website_trust: profile.websiteTrust || null,

    company_research: companyResearch || {
      business_model: 'Unknown',
      category_summary: profile.industry || 'Unknown',
      products: profile.products,
      industry: profile.industry || 'Unknown',
      size_estimate: '1-10',
      india_fit_score: 50,
      likely_buying_pattern: profile.tradeStats.frequency,
      source_urls: [],
    },

    contacts: contacts.map((c, index) => ({
      name: c.name || 'Unknown',
      title: c.title || 'Unknown',
      email: c.email,
      email_verified: c.emailVerified,
      email_status: (c as any).email_status || 'unknown',
      email_confidence: (c as any).email_confidence || 0.5,
      email_source: (c as any).email_source || c.source,
      linkedin: c.linkedin,
      phone: c.phone,
      phone_verified: (c as any).phone_verified || false,
      role_relevance_score: (c as any).role_relevance_score || 50,
    })),

    best_contact_index: (profile as any).best_contact_index || 0,

    trade_data: {
      hs_codes: profile.hsCodes,
      products: profile.products,
      total_amount_usd: profile.tradeStats.totalValue,
      transaction_count: profile.tradeStats.totalShipments,
      last_trade_date: profile.tradeStats.dateRange.last,
      trade_frequency: profile.tradeStats.totalShipments / 12, // per month
      indian_suppliers: (profile as any).indian_suppliers || [],
      buyer_tier: profile.tier === 'top' ? 'platinum' : profile.tier === 'premium' ? 'gold' : 'silver',
    },

    intelligence: intelligence || {
      fit_score: 50,
      fit_band: 'MEDIUM',
      recommended_angle: 'Cost-effective sourcing from India',
      icebreaker_points: [],
      likely_pain_points: [],
      india_relevance: 'India offers competitive pricing',
      category_advantage: 'Strong manufacturing base',
    },

    mention_policy: mentionPolicy || {
      safe_to_mention: [],
      infer_only: [],
      must_not_mention: ['Specific supplier names', 'Exact values'],
    },

    compliance_claims: buildComplianceClaims(companyResearch, profile),

    channel_eligibility: channelEligibility || {
      email: false,
      linkedin: false,
      whatsapp: false,
      reason: {
        email: 'No verified email',
        linkedin: 'No LinkedIn profile',
        whatsapp: 'No verified phone',
      },
    },

    qualification: qualification || {
      action: 'RESEARCH_MORE',
      reasoning: 'Insufficient data',
      model_used: 'qwen3-8b',
    },

    confidence: confidence || {
      company: 'low',
      contact: 'low',
      verification: 'low',
      fit: 'low',
    },

    pipeline_state: 'new', // Will be updated based on qualification
    qa: {
      sampled: false,
      reviewed: false,
      passed: null,
      reviewer: null,
      reviewedAt: null,
      notes: null,
    },

    risk_flags: [],

    created_at: now,
    updated_at: now,
  };

  // Build risk flags after enrichedBuyer is created
  enrichedBuyer.risk_flags = buildRiskFlags(profile, qualification, enrichedBuyer.website_trust);

  return enrichedBuyer;
}

/**
 * Derive compliance claims from company research and trade data.
 * Only generates claims that can be verified from known data.
 */
function buildComplianceClaims(
  companyResearch: any,
  profile: BuyerProfile
): import('../../types').ComplianceClaim[] {
  const claims: import('../../types').ComplianceClaim[] = [];

  if (companyResearch?.industry) {
    claims.push({
      claim: `Active importer in ${companyResearch.industry} category`,
      verified: true,
      confidence: 0.95,
      source: 'trade_data',
    });
  }

  if (profile.tradeStats.totalShipments >= 10) {
    claims.push({
      claim: `Regular import history: ${profile.tradeStats.totalShipments} shipments on record`,
      verified: true,
      confidence: 0.99,
      source: 'trade_data',
    });
  }

  if (profile.hsCodes.length > 0) {
    claims.push({
      claim: `Imports under HS codes: ${profile.hsCodes.slice(0, 3).join(', ')}`,
      verified: true,
      confidence: 0.99,
      source: 'trade_data',
    });
  }

  return claims;
}

/**
 * Build risk flags from qualification result, subsidiary info, and trade stats.
 */
function buildRiskFlags(
  profile: BuyerProfile,
  qualification: any,
  websiteTrust: import('../../types').WebsiteTrustReport | null
): string[] {
  const flags: string[] = [];

  if (qualification?.action === 'SKIP') {
    flags.push(`Auto-SKIP: ${qualification.reasoning}`);
  }

  if (websiteTrust?.subsidiary?.isSubsidiary && websiteTrust.subsidiary.parentIsFortune500) {
    flags.push(`Fortune 500 subsidiary: ${websiteTrust.subsidiary.parentCompany}`);
  }

  if (websiteTrust?.trustBand === 'low' || websiteTrust?.trustBand === 'rejected') {
    flags.push(`Low website trust: ${websiteTrust.trustScore}/100`);
  }

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  if (new Date(profile.tradeStats.dateRange.last) < twoYearsAgo) {
    flags.push('Last trade > 2 years ago — buyer may be inactive');
  }

  if (profile.tradeStats.totalValue < 5000) {
    flags.push('Low total trade value — may be noise record');
  }

  return flags;
}

/**
 * Determine pipeline state based on qualification and data completeness
 */
function determinePipelineState(
  profile: BuyerProfile,
  enrichedBuyer: EnrichedBuyer
): PipelineState {
  const qualification = enrichedBuyer.qualification;

  // Check for critical issues
  if (enrichedBuyer.contacts.length === 0) {
    return 'contact_not_found';
  }

  if (enrichedBuyer.contacts[0] && !enrichedBuyer.contacts[0].email_verified) {
    return 'email_unverified';
  }

  // Based on qualification
  switch (qualification.action) {
    case 'CONTACT_NOW':
      return 'ready';
    case 'RESEARCH_MORE':
      return 'research_more';
    case 'NURTURE_LATER':
      return 'verified';
    case 'SKIP':
      return 'suppressed';
    default:
      return 'new';
  }
}

