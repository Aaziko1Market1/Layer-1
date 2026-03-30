import { BaseAgent } from './base.agent';
import type { BuyerProfile, ConfidenceScores } from '../../types';
import type { CompanyResearch } from './company-research.agent';
import type { Contact } from './contact-discovery.agent';

/**
 * Agent 3: Verification Agent
 * Cross-checks data quality and computes 4-level confidence scores
 */
export class VerificationAgent extends BaseAgent {
  constructor() {
    super('VerificationAgent');
  }

  /**
   * Verify data and compute confidence scores
   */
  async verify(
    profile: BuyerProfile,
    companyResearch: CompanyResearch,
    contacts: Contact[]
  ): Promise<ConfidenceScores> {
    const start = Date.now();
    this.logStart(profile.companyName, 'verification');

    try {
      // Collect all data sources
      const sources = this.collectSources(profile, companyResearch, contacts);

      // Compute 4 confidence levels
      const confidence: ConfidenceScores = {
        company: this.computeCompanyConfidence(sources.companySources),
        contact: this.computeContactConfidence(contacts),
        verification: this.computeVerificationConfidence({
          domainVerified: !!profile.domain,
          nameVerified: sources.companySources.length >= 2,
          countryVerified: !!profile.country,
          industryVerified: !!profile.industry,
          contactVerified: contacts.length > 0 && contacts[0].email_verified,
        }),
        fit: this.computeFitConfidence(companyResearch.india_fit_score),
      };

      this.logComplete(profile.companyName, 'verification', Date.now() - start);
      return confidence;
    } catch (err: any) {
      this.logError(profile.companyName, 'verification', err.message);

      // Return low confidence on error
      return {
        company: 'low',
        contact: 'low',
        verification: 'low',
        fit: 'low',
      };
    }
  }

  /**
   * Collect all data sources
   */
  private collectSources(
    profile: BuyerProfile,
    companyResearch: CompanyResearch,
    contacts: Contact[]
  ): {
    companySources: string[];
    contactSources: string[];
  } {
    const companySources: string[] = [];
    const contactSources: string[] = [];

    // Company sources
    if (profile.domain) companySources.push('domain');
    if (profile.verifiedWebsite) companySources.push('website');
    if (profile.enrichment.apollo?.status === 'success') companySources.push('apollo');
    if (profile.enrichment.hunter?.status === 'success') companySources.push('hunter');
    if (profile.enrichment.brave?.status === 'success') companySources.push('brave');
    if (companyResearch.source_urls.length > 0) companySources.push('research');

    // Contact sources
    const uniqueContactSources = new Set(contacts.map((c) => c.email_source));
    contactSources.push(...uniqueContactSources);

    return { companySources, contactSources };
  }

  /**
   * Compute company confidence
   */
  private computeCompanyConfidence(sources: string[]): 'high' | 'medium' | 'low' {
    const uniqueSources = new Set(sources);
    if (uniqueSources.size >= 3) return 'high';
    if (uniqueSources.size === 2) return 'medium';
    return 'low';
  }

  /**
   * Compute contact confidence
   */
  private computeContactConfidence(contacts: Contact[]): 'high' | 'medium' | 'low' {
    if (contacts.length === 0) return 'low';

    const bestContact = contacts[0];
    const hasVerifiedEmail =
      bestContact.email_verified && bestContact.email_status === 'verified_safe';
    const hasLinkedIn = !!bestContact.linkedin;

    if (hasVerifiedEmail && hasLinkedIn) return 'high';
    if (hasVerifiedEmail || hasLinkedIn) return 'medium';
    return 'low';
  }

  /**
   * Compute verification confidence
   */
  private computeVerificationConfidence(data: {
    domainVerified: boolean;
    nameVerified: boolean;
    countryVerified: boolean;
    industryVerified: boolean;
    contactVerified: boolean;
  }): 'high' | 'medium' | 'low' {
    const verifiedCount = Object.values(data).filter(Boolean).length;
    if (verifiedCount >= 4) return 'high';
    if (verifiedCount >= 2) return 'medium';
    return 'low';
  }

  /**
   * Compute fit confidence
   */
  private computeFitConfidence(india_fit_score: number): 'high' | 'medium' | 'low' {
    if (india_fit_score >= 70) return 'high';
    if (india_fit_score >= 50) return 'medium';
    return 'low';
  }
}

