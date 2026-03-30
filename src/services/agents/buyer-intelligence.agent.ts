import { BaseAgent } from './base.agent';
import type {
  BuyerProfile,
  ConfidenceScores,
  MentionPolicy,
  ChannelEligibility,
  QualificationResult,
} from '../../types';
import type { CompanyResearch } from './company-research.agent';
import type { Contact } from './contact-discovery.agent';

export interface BuyerIntelligence {
  fit_score: number;
  fit_band: 'HIGH' | 'MEDIUM' | 'LOW';
  recommended_angle: string;
  icebreaker_points: string[];
  likely_pain_points: string[];
  india_relevance: string;
  category_advantage: string;
}

export interface IntelligenceResult {
  intelligence: BuyerIntelligence;
  mention_policy: MentionPolicy;
  channel_eligibility: ChannelEligibility;
  qualification: QualificationResult;
}

/**
 * Agent 4: Buyer Intelligence Agent
 * Generates actionable intelligence, mention policy, channel eligibility, and qualification
 */
export class BuyerIntelligenceAgent extends BaseAgent {
  constructor() {
    super('BuyerIntelligenceAgent');
  }

  /**
   * Generate buyer intelligence
   */
  async generateIntelligence(
    profile: BuyerProfile,
    companyResearch: CompanyResearch,
    contacts: Contact[],
    confidence: ConfidenceScores
  ): Promise<IntelligenceResult> {
    const start = Date.now();
    this.logStart(profile.companyName, 'intelligence generation');

    try {
      // Step 1: Analyze trade patterns
      const tradePatterns = this.analyzeTradePatterns(profile);

      // Step 2: Generate icebreakers
      const icebreaker_points = this.generateIcebreakers(profile, companyResearch);

      // Step 3: Identify pain points
      const likely_pain_points = this.identifyPainPoints(profile, tradePatterns);

      // Step 4: Compute fit score
      const fit_score = this.computeFitScore(profile, companyResearch, contacts);

      // Step 5: Classify fit band
      const fit_band = this.classifyFitBand(fit_score);

      // Step 6: Generate recommended angle
      const recommended_angle = this.generateRecommendedAngle(profile, companyResearch, fit_score);

      // Step 7: Generate India relevance
      const india_relevance = this.generateIndiaRelevance(companyResearch, profile);

      // Step 8: Generate category advantage
      const category_advantage = this.generateCategoryAdvantage(profile.industry);

      // Step 9: Compute mention policy
      const mention_policy = this.computeMentionPolicy(profile, companyResearch);

      // Step 10: Compute channel eligibility
      const channel_eligibility = this.computeChannelEligibility(contacts);

      // Step 11: Generate qualification
      const qualification = this.generateQualification(fit_score, confidence, contacts);

      const intelligence: BuyerIntelligence = {
        fit_score,
        fit_band,
        recommended_angle,
        icebreaker_points,
        likely_pain_points,
        india_relevance,
        category_advantage,
      };

      this.logComplete(profile.companyName, 'intelligence generation', Date.now() - start);

      return {
        intelligence,
        mention_policy,
        channel_eligibility,
        qualification,
      };
    } catch (err: any) {
      this.logError(profile.companyName, 'intelligence generation', err.message);

      // Return minimal intelligence
      return {
        intelligence: {
          fit_score: 50,
          fit_band: 'MEDIUM',
          recommended_angle: 'Cost-effective sourcing from India',
          icebreaker_points: [`Active buyer in ${profile.industry || 'industrial'} category`],
          likely_pain_points: ['Supply chain optimization needed'],
          india_relevance: 'India offers competitive pricing',
          category_advantage: 'Strong manufacturing base',
        },
        mention_policy: {
          safe_to_mention: ['Active buyer'],
          infer_only: ['Procurement needs'],
          must_not_mention: ['Specific supplier names', 'Exact values'],
        },
        channel_eligibility: {
          email: false,
          linkedin: false,
          whatsapp: false,
          reason: {
            email: 'No verified email',
            linkedin: 'No LinkedIn profile',
            whatsapp: 'No verified phone',
          },
        },
        qualification: {
          action: 'RESEARCH_MORE',
          reasoning: 'Intelligence generation failed, need more data',
          model_used: 'qwen3-8b',
        },
      };
    }
  }

  /**
   * Analyze trade patterns
   */
  private analyzeTradePatterns(profile: BuyerProfile): {
    shipmentsPerMonth: number;
    hasSeasonality: boolean;
    supplierCount: number;
    volumeTrend: 'increasing' | 'stable' | 'decreasing';
  } {
    const { totalShipments, frequency, dateRange, topOriginCountries } = profile.tradeStats;

    const monthsActive =
      (dateRange.last.getTime() - dateRange.first.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const shipmentsPerMonth = monthsActive > 0 ? totalShipments / monthsActive : 0;

    return {
      shipmentsPerMonth,
      hasSeasonality: frequency === 'quarterly',
      supplierCount: topOriginCountries.length,
      volumeTrend: 'stable', // Simplified (would need historical data)
    };
  }

  /**
   * Generate icebreaker points
   */
  private generateIcebreakers(profile: BuyerProfile, companyResearch: CompanyResearch): string[] {
    const icebreakers: string[] = [];

    // Shipment volume
    icebreakers.push(`Imported ${profile.tradeStats.totalShipments} shipments in 2024`);

    // Primary supplier
    if (profile.tradeStats.topOriginCountries[0]) {
      const top = profile.tradeStats.topOriginCountries[0];
      icebreakers.push(`Primary supplier is ${top.country} (${top.count} shipments)`);
    }

    // Buying pattern
    icebreakers.push(`${this.capitalize(profile.tradeStats.frequency)} buying pattern`);

    // Product category
    if (profile.industry) {
      icebreakers.push(`Active in ${profile.industry} category`);
    }

    // Trade value
    if (profile.tradeStats.totalValue > 100000) {
      icebreakers.push(
        `Annual import value: $${(profile.tradeStats.totalValue / 1000).toFixed(0)}K`
      );
    }

    // Company size
    if (companyResearch.size_estimate && companyResearch.size_estimate !== '1-10') {
      icebreakers.push(`Company size: ${companyResearch.size_estimate} employees`);
    }

    return icebreakers.slice(0, 5);
  }

  /**
   * Identify pain points
   */
  private identifyPainPoints(
    profile: BuyerProfile,
    tradePatterns: { supplierCount: number }
  ): string[] {
    const painPoints: string[] = [];

    // High-cost suppliers
    const europeanSuppliers = profile.tradeStats.topOriginCountries.filter((c) =>
      ['Germany', 'Italy', 'France', 'UK', 'Spain', 'Netherlands', 'Belgium'].includes(c.country)
    );
    if (europeanSuppliers.length > 0) {
      painPoints.push('High import costs from European suppliers');
    }

    // Low supplier diversity
    if (tradePatterns.supplierCount <= 2) {
      painPoints.push('Limited supplier diversity (supply chain risk)');
    }

    // Infrequent buying
    if (profile.tradeStats.frequency === 'sporadic') {
      painPoints.push('Irregular procurement (potential planning issues)');
    }

    // Long lead times
    const distantSuppliers = profile.tradeStats.topOriginCountries.filter((c) =>
      ['USA', 'Brazil', 'Australia', 'Japan', 'South Korea'].includes(c.country)
    );
    if (distantSuppliers.length > 0) {
      painPoints.push('Long lead times from distant suppliers');
    }

    // High shipment frequency (potential for consolidation)
    if (profile.tradeStats.frequency === 'weekly') {
      painPoints.push('High shipment frequency (consolidation opportunity)');
    }

    return painPoints.slice(0, 4);
  }

  /**
   * Compute fit score (0-100)
   */
  private computeFitScore(
    profile: BuyerProfile,
    companyResearch: CompanyResearch,
    contacts: Contact[]
  ): number {
    let score = 0;

    // Trade volume (0-25 points)
    const shipments = profile.tradeStats.totalShipments;
    if (shipments >= 100) score += 25;
    else if (shipments >= 50) score += 20;
    else if (shipments >= 20) score += 15;
    else if (shipments >= 10) score += 10;
    else score += 5;

    // India relevance (0-25 points)
    score += Math.round((companyResearch.india_fit_score / 100) * 25);

    // Contact quality (0-20 points)
    if (contacts.length > 0) {
      const bestContact = contacts[0];
      if (bestContact.email_verified && bestContact.email_status === 'verified_safe') score += 20;
      else if (bestContact.email_verified) score += 15;
      else if (bestContact.email) score += 10;
      else score += 5;
    }

    // Buying frequency (0-15 points)
    if (profile.tradeStats.frequency === 'weekly') score += 15;
    else if (profile.tradeStats.frequency === 'monthly') score += 12;
    else if (profile.tradeStats.frequency === 'quarterly') score += 8;
    else score += 3;

    // Company size (0-15 points)
    const size = companyResearch.size_estimate;
    if (size === '200-1000' || size === '1000+') score += 15;
    else if (size === '50-200') score += 12;
    else if (size === '10-50') score += 8;
    else score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify fit band
   */
  private classifyFitBand(fit_score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (fit_score >= 70) return 'HIGH';
    if (fit_score >= 50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate recommended angle
   */
  private generateRecommendedAngle(
    profile: BuyerProfile,
    companyResearch: CompanyResearch,
    fit_score: number
  ): string {
    if (fit_score >= 70) {
      return `Cost savings on ${profile.industry || 'industrial'} products with reliable Indian suppliers`;
    } else if (fit_score >= 50) {
      return `Explore Indian alternatives for ${profile.products[0] || 'your products'} to reduce costs`;
    } else {
      return 'Diversify supply chain with competitive Indian manufacturers';
    }
  }

  /**
   * Generate India relevance
   */
  private generateIndiaRelevance(companyResearch: CompanyResearch, profile: BuyerProfile): string {
    const industry = (profile.industry || '').toLowerCase();

    const relevanceMap: Record<string, string> = {
      textile: 'India is the 2nd largest textile exporter globally',
      chemical: 'India has a strong chemical manufacturing base with 30-40% cost advantage',
      pharmaceutical: 'India is the pharmacy of the world, supplying 50% of global generics',
      machinery: 'Indian machinery manufacturers offer competitive pricing with quality',
      electronic: 'India is rapidly growing in electronics manufacturing',
      automotive: 'India is a major automotive parts exporter with established supply chains',
      steel: 'India is the 2nd largest steel producer globally',
      plastic: 'Indian plastic manufacturers offer cost-effective solutions',
      leather: 'India is a leading leather goods exporter',
      jewelry: 'India is a major jewelry manufacturing hub',
    };

    for (const [key, value] of Object.entries(relevanceMap)) {
      if (industry.includes(key)) {
        return value;
      }
    }

    return 'Indian manufacturers offer 30-40% cost savings with reliable quality';
  }

  /**
   * Generate category advantage
   */
  private generateCategoryAdvantage(industry: string | null): string {
    if (!industry) return 'Strong manufacturing base across multiple categories';

    const industryLower = industry.toLowerCase();

    if (industryLower.includes('textile')) return 'World-class textile manufacturing ecosystem';
    if (industryLower.includes('chemical')) return 'Advanced chemical processing capabilities';
    if (industryLower.includes('pharmaceutical')) return 'FDA-approved manufacturing facilities';
    if (industryLower.includes('machinery')) return 'Precision engineering with cost efficiency';
    if (industryLower.includes('electronic')) return 'Growing electronics manufacturing hub';
    if (industryLower.includes('automotive')) return 'Tier-1 automotive supplier ecosystem';

    return 'Competitive manufacturing with quality certifications';
  }

  /**
   * Compute mention policy
   */
  private computeMentionPolicy(
    profile: BuyerProfile,
    companyResearch: CompanyResearch
  ): MentionPolicy {
    const safe_to_mention: string[] = [
      `${profile.tradeStats.totalShipments} shipments in 2024`,
      `${this.capitalize(profile.tradeStats.frequency)} buying pattern`,
      `${profile.industry || 'Industrial'} category`,
    ];

    if (profile.tradeStats.topOriginCountries[0]) {
      safe_to_mention.push(`Imports from ${profile.tradeStats.topOriginCountries[0].country}`);
    }

    const infer_only: string[] = [
      `Estimated procurement budget: $${(profile.tradeStats.totalValue / 1000).toFixed(0)}K`,
      `Company size: ${companyResearch.size_estimate || 'unknown'} employees`,
    ];

    if (profile.tradeStats.frequency === 'sporadic') {
      infer_only.push('Potential for more regular procurement');
    }

    const must_not_mention: string[] = [
      'Specific supplier names',
      'Exact shipment values',
      'Competitor information',
      'Internal procurement processes',
      'Pricing details from trade data',
    ];

    return { safe_to_mention, infer_only, must_not_mention };
  }

  /**
   * Compute channel eligibility
   */
  private computeChannelEligibility(contacts: Contact[]): ChannelEligibility {
    if (contacts.length === 0) {
      return {
        email: false,
        linkedin: false,
        whatsapp: false,
        reason: {
          email: 'No contact found',
          linkedin: 'No contact found',
          whatsapp: 'No contact found',
        },
      };
    }

    const bestContact = contacts[0];

    return {
      email: bestContact.email_verified && bestContact.email_status === 'verified_safe',
      linkedin: !!bestContact.linkedin,
      whatsapp: bestContact.phone_verified || false,
      reason: {
        email: bestContact.email_verified
          ? 'Verified email with high deliverability'
          : 'Email not verified or risky',
        linkedin: bestContact.linkedin
          ? 'LinkedIn profile found'
          : 'No LinkedIn profile found',
        whatsapp: bestContact.phone_verified
          ? 'Verified phone number'
          : 'No verified phone number',
      },
    };
  }

  /**
   * Generate qualification decision
   */
  private generateQualification(
    fit_score: number,
    confidence: ConfidenceScores,
    contacts: Contact[]
  ): QualificationResult {
    // CONTACT_NOW: High fit + verified contact
    if (fit_score >= 70 && confidence.contact === 'high' && contacts.length > 0) {
      return {
        action: 'CONTACT_NOW',
        reasoning: `High fit score (${fit_score}), verified contact, active buyer`,
        model_used: 'qwen3-8b',
      };
    }

    // RESEARCH_MORE: Missing critical data
    if (contacts.length === 0 || confidence.company === 'low') {
      return {
        action: 'RESEARCH_MORE',
        reasoning: 'Missing contact information or low company confidence',
        model_used: 'qwen3-8b',
      };
    }

    // NURTURE_LATER: Medium fit
    if (fit_score >= 50 && fit_score < 70) {
      return {
        action: 'NURTURE_LATER',
        reasoning: `Medium fit score (${fit_score}), potential for future engagement`,
        model_used: 'qwen3-8b',
      };
    }

    // SKIP: Low fit
    return {
      action: 'SKIP',
      reasoning: `Low fit score (${fit_score}), not a good match`,
      model_used: 'qwen3-8b',
    };
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

