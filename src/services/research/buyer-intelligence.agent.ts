import { logger } from '../../config/logger';
import { aiGenerate } from '../ai/router';
import type {
  BuyerProfile,
  MentionPolicy,
  ChannelEligibility,
  ContactInfo,
  SubsidiaryInfo,
  WebsiteTrustReport,
  ComplianceClaim,
} from '../../types';
import { shouldSkipBuyer } from '../../types';

export interface BuyerIntelligenceInput {
  profile: BuyerProfile;
  contacts: ContactInfo[];
  websiteTrust: WebsiteTrustReport | null;
  subsidiary: SubsidiaryInfo | null;
  companyResearch: Record<string, unknown>;
}

export interface BuyerIntelligenceResult {
  fit_score: number;
  fit_band: 'HIGH' | 'MEDIUM' | 'LOW';
  action: 'CONTACT_NOW' | 'RESEARCH_MORE' | 'NURTURE_LATER' | 'SKIP';
  reasoning: string;
  business_model: string;
  likely_pain_points: string[];
  likely_buying_pattern: string;
  india_relevance: string;
  category_advantage: string;
  recommended_angle: string;
  icebreaker_points: string[];
  mention_policy: MentionPolicy;
  compliance_claims: ComplianceClaim[];
  channel_eligibility: ChannelEligibility;
  model_used: string;
  risk_flags: string[];
}

/**
 * Agent D: Buyer Intelligence
 * Produces fit scores, mention policies, channel eligibility, SKIP rules.
 * Uses tiered model routing: 8B (<40), 32B (40-75), 235B (>75).
 */
export class BuyerIntelligenceAgent {
  async analyze(input: BuyerIntelligenceInput): Promise<BuyerIntelligenceResult> {
    const { profile, contacts, websiteTrust, subsidiary, companyResearch } = input;

    logger.info('BuyerIntelligence: analyzing', { buyer: profile.companyName });

    // ── SKIP Rules ────────────────────────────────────
    const skipCheck = shouldSkipBuyer(profile, subsidiary || undefined);
    if (skipCheck.skip) {
      logger.info('BuyerIntelligence: SKIP', { buyer: profile.companyName, reason: skipCheck.reason });
      return this.buildSkipResult(profile, skipCheck.reason);
    }

    // ── Preliminary fit score (before AI) ─────────────
    const prelimScore = this.computePreliminaryFitScore(profile, contacts, websiteTrust);

    // ── Tiered AI routing ─────────────────────────────
    const tier = prelimScore < 40 ? 'standard' : prelimScore <= 75 ? 'premium' : 'top';

    const hasVerifiedEmail = contacts.some(c => c.emailVerified);
    const hasLinkedin = contacts.some(c => c.linkedin);

    // ── Channel Eligibility ───────────────────────────
    const channel_eligibility: ChannelEligibility = {
      email: hasVerifiedEmail,
      linkedin: hasLinkedin && contacts.some(c => c.linkedin && (c as any).roleRelevanceScore >= 50),
      whatsapp: false, // only if explicit business WhatsApp found
      reason: {
        email: hasVerifiedEmail ? 'Verified email found' : 'No verified email available',
        linkedin: hasLinkedin ? 'LinkedIn profile found for relevant contact' : 'No LinkedIn profile found',
        whatsapp: 'Business WhatsApp not explicitly confirmed (never assume personal mobile = WhatsApp)',
      },
    };

    // ── Mention Policy (default rules per spec) ───────
    const mention_policy: MentionPolicy = {
      safe_to_mention: [
        'company is active in this category',
        'India sourcing as additional option',
        'quality inspection process',
      ],
      infer_only: [
        'likely repeat buying cycle',
        'margin sensitivity',
        'supplier diversification need',
      ],
      must_not_mention: [
        'exact trade value',
        'exact shipment dates',
        'exact supplier names from trade data',
        'internal lead score',
        'how we found their contact',
        'raw database fields',
      ],
    };

    // ── AI Analysis ───────────────────────────────────
    const prompt = this.buildAnalysisPrompt(profile, contacts, companyResearch, websiteTrust);

    try {
      const response = await aiGenerate({ prompt, tier: tier as any, maxTokens: 2048, temperature: 0.3 });

      let parsed: Record<string, unknown> = {};
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = { raw: response.content };
      }

      const fit_score = Math.min(100, Math.max(0, (parsed.fit_score as number) || prelimScore));
      const fit_band = fit_score >= 70 ? 'HIGH' : fit_score >= 40 ? 'MEDIUM' : 'LOW';

      // Determine action
      let action: 'CONTACT_NOW' | 'RESEARCH_MORE' | 'NURTURE_LATER' | 'SKIP' = 'RESEARCH_MORE';
      if (fit_score >= 70 && hasVerifiedEmail) action = 'CONTACT_NOW';
      else if (fit_score >= 40) action = 'RESEARCH_MORE';
      else if (fit_score >= 20) action = 'NURTURE_LATER';
      else action = 'SKIP';

      // Risk flags
      const risk_flags: string[] = [];
      if (subsidiary?.parentIsFortune500) risk_flags.push('Fortune 500 subsidiary — procurement may happen at parent level');
      if (!hasVerifiedEmail) risk_flags.push('No verified email — contact reliability uncertain');
      if (websiteTrust && websiteTrust.trustScore < 50) risk_flags.push('Low website trust score — company identity not fully verified');
      if (profile.tradeStats.totalShipments <= 2) risk_flags.push('Low trade volume — may be one-time buyer');

      // AI-refined mention policy
      if (parsed.safe_to_mention && Array.isArray(parsed.safe_to_mention)) {
        mention_policy.safe_to_mention = [...mention_policy.safe_to_mention, ...(parsed.safe_to_mention as string[])];
      }
      if (parsed.icebreaker_points && Array.isArray(parsed.icebreaker_points)) {
        mention_policy.safe_to_mention.push(...(parsed.icebreaker_points as string[]));
      }

      return {
        fit_score,
        fit_band,
        action,
        reasoning: (parsed.reasoning as string) || `Fit score ${fit_score}, band ${fit_band}`,
        business_model: (parsed.business_model as string) || 'unknown',
        likely_pain_points: (parsed.pain_points as string[]) || [],
        likely_buying_pattern: (parsed.buying_pattern as string) || 'unknown',
        india_relevance: (parsed.india_relevance as string) || 'unknown',
        category_advantage: (parsed.category_advantage as string) || 'unknown',
        recommended_angle: (parsed.recommended_angle as string) || 'India sourcing opportunity',
        icebreaker_points: (parsed.icebreaker_points as string[]) || [],
        mention_policy,
        compliance_claims: [],
        channel_eligibility,
        model_used: response.model,
        risk_flags,
      };
    } catch (err: any) {
      logger.error('BuyerIntelligence: AI analysis failed', { buyer: profile.companyName, error: err.message });
      // Return fallback result using preliminary scoring
      const fit_band = prelimScore >= 70 ? 'HIGH' : prelimScore >= 40 ? 'MEDIUM' : 'LOW';
      return {
        fit_score: prelimScore,
        fit_band,
        action: prelimScore >= 70 ? 'CONTACT_NOW' : prelimScore >= 40 ? 'RESEARCH_MORE' : 'NURTURE_LATER',
        reasoning: `AI unavailable; preliminary score ${prelimScore} used`,
        business_model: 'unknown',
        likely_pain_points: [],
        likely_buying_pattern: 'unknown',
        india_relevance: 'unknown',
        category_advantage: 'unknown',
        recommended_angle: 'India sourcing opportunity',
        icebreaker_points: [],
        mention_policy,
        compliance_claims: [],
        channel_eligibility,
        model_used: 'fallback',
        risk_flags: ['AI analysis unavailable — using preliminary scoring'],
      };
    }
  }

  private computePreliminaryFitScore(
    profile: BuyerProfile,
    contacts: ContactInfo[],
    trust: WebsiteTrustReport | null
  ): number {
    let score = 0;

    // Trade volume (0-25)
    const value = profile.tradeStats.totalValue;
    if (value >= 1_000_000) score += 25;
    else if (value >= 100_000) score += 20;
    else if (value >= 10_000) score += 12;
    else score += 5;

    // Shipment count (0-20)
    const shipments = profile.tradeStats.totalShipments;
    if (shipments >= 50) score += 20;
    else if (shipments >= 20) score += 15;
    else if (shipments >= 5) score += 10;
    else score += 3;

    // Recency (0-15)
    const lastTrade = new Date(profile.tradeStats.dateRange.last);
    const monthsAgo = (Date.now() - lastTrade.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo < 6) score += 15;
    else if (monthsAgo < 12) score += 10;
    else if (monthsAgo < 24) score += 5;

    // Contact quality (0-15)
    if (contacts.some(c => c.emailVerified)) score += 15;
    else if (contacts.length > 0) score += 8;

    // Website trust (0-15)
    if (trust && trust.trustScore >= 70) score += 15;
    else if (trust && trust.trustScore >= 50) score += 10;
    else if (trust) score += 3;

    // Frequency bonus (0-10)
    if (profile.tradeStats.frequency === 'weekly') score += 10;
    else if (profile.tradeStats.frequency === 'monthly') score += 7;
    else if (profile.tradeStats.frequency === 'quarterly') score += 4;

    return Math.min(100, score);
  }

  private buildSkipResult(profile: BuyerProfile, reason: string): BuyerIntelligenceResult {
    return {
      fit_score: 0,
      fit_band: 'LOW',
      action: 'SKIP',
      reasoning: reason,
      business_model: 'unknown',
      likely_pain_points: [],
      likely_buying_pattern: 'unknown',
      india_relevance: 'not applicable',
      category_advantage: 'not applicable',
      recommended_angle: 'not applicable',
      icebreaker_points: [],
      mention_policy: { safe_to_mention: [], infer_only: [], must_not_mention: ['all data'] },
      compliance_claims: [],
      channel_eligibility: {
        email: false, linkedin: false, whatsapp: false,
        reason: { email: `SKIP: ${reason}`, linkedin: `SKIP: ${reason}`, whatsapp: `SKIP: ${reason}` },
      },
      model_used: 'skip_rules',
      risk_flags: [reason],
    };
  }

  private buildAnalysisPrompt(
    profile: BuyerProfile,
    contacts: ContactInfo[],
    companyResearch: Record<string, unknown>,
    trust: WebsiteTrustReport | null
  ): string {
    return `Analyze this buyer for B2B outreach from India.

Company: ${profile.companyName}
Country: ${profile.country}
Products: ${profile.products.slice(0, 10).join(', ')}
HS Codes: ${profile.hsCodes.slice(0, 10).join(', ')}
Trade Volume: $${profile.tradeStats.totalValue.toLocaleString()}
Shipments: ${profile.tradeStats.totalShipments}
Frequency: ${profile.tradeStats.frequency}
Tier: ${profile.tier}
Website Trust: ${trust ? `${trust.trustScore}/100 (${trust.trustBand})` : 'not verified'}
Contacts Found: ${contacts.length}
Company Research: ${JSON.stringify(companyResearch).substring(0, 500)}

Respond ONLY in JSON:
{
  "fit_score": 0-100,
  "reasoning": "why this score",
  "business_model": "manufacturer|distributor|retailer|trading_company|unknown",
  "pain_points": ["list of likely pain points"],
  "buying_pattern": "description",
  "india_relevance": "why India sourcing fits",
  "category_advantage": "Aaziko's advantage for this category",
  "recommended_angle": "best outreach angle",
  "icebreaker_points": ["safe things to mention in outreach"],
  "safe_to_mention": ["additional safe-to-mention items beyond defaults"]
}`;
  }
}
