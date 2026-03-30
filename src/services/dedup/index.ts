import { ObjectId } from 'mongodb';
import { logger } from '../../config/logger';
import { getBuyerDb } from '../../config/mongodb';
import type { DedupDecision, SubsidiaryInfo } from '../../types';

/**
 * 4-Level Deduplication Service (per spec Stage 4)
 * Level 1: Exact domain match
 * Level 2: Company name fuzzy match
 * Level 3: Parent company match
 * Level 4: Email domain match
 */
export class DeduplicationService {
  /**
   * Check all 4 dedup levels. Returns blocked=true if duplicate found.
   */
  async checkDuplicate(
    buyerId: ObjectId,
    options: {
      domain: string | null;
      normalizedName: string;
      country: string;
      parentCompany: string | null;
      contactEmails: string[];
    }
  ): Promise<DedupDecision> {
    const db = getBuyerDb();
    const now = new Date();

    // Level 1: Exact domain match
    if (options.domain) {
      const domainMatch = await db.collection('enriched_buyers').findOne({
        'verified_company.domain': options.domain,
        _id: { $ne: buyerId },
      });

      if (domainMatch) {
        const lastUpdated = domainMatch.updated_at || domainMatch.created_at;
        const daysSince = (now.getTime() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < 14) {
          const decision = this.buildDecision(buyerId, domainMatch._id, 'domain', 'blocked',
            `Domain ${options.domain} already enriched ${Math.round(daysSince)} days ago`);
          await this.storeDecision(decision);
          return decision;
        }
      }
    }

    // Level 2: Company name fuzzy match
    const nameMatch = await this.fuzzyNameMatch(buyerId, options.normalizedName, options.country);
    if (nameMatch) {
      const decision = this.buildDecision(buyerId, nameMatch._id, 'name', 'blocked',
        `Company name fuzzy match: "${options.normalizedName}" ≈ "${nameMatch.verified_company?.name}"`);
      await this.storeDecision(decision);
      return decision;
    }

    // Level 3: Parent company match
    if (options.parentCompany) {
      const parentMatch = await db.collection('enriched_buyers').findOne({
        $or: [
          { 'verified_company.name': { $regex: new RegExp(this.escapeRegex(options.parentCompany), 'i') } },
          { 'website_trust.subsidiary.parentCompany': { $regex: new RegExp(this.escapeRegex(options.parentCompany), 'i') } },
        ],
        _id: { $ne: buyerId },
        pipeline_state: { $in: ['ready', 'qa_passed', 'verified', 'contact_found'] },
      });

      if (parentMatch) {
        const decision = this.buildDecision(buyerId, parentMatch._id, 'parent', 'blocked',
          `Parent company "${options.parentCompany}" already has active enriched buyer`);
        await this.storeDecision(decision);
        return decision;
      }
    }

    // Level 4: Email domain match
    const emailDomains = options.contactEmails
      .map(e => e.split('@')[1]?.toLowerCase())
      .filter(Boolean);

    for (const emailDomain of emailDomains) {
      const emailMatch = await db.collection('enriched_buyers').findOne({
        'verified_company.domain': emailDomain,
        _id: { $ne: buyerId },
      });

      if (emailMatch) {
        const decision = this.buildDecision(buyerId, emailMatch._id, 'email', 'blocked',
          `Contact email domain @${emailDomain} matches existing enriched buyer`);
        await this.storeDecision(decision);
        return decision;
      }
    }

    // No duplicate found
    const decision = this.buildDecision(buyerId, null, null, 'allowed', 'No duplicates found across all 4 levels');
    await this.storeDecision(decision);
    return decision;
  }

  private async fuzzyNameMatch(
    buyerId: ObjectId,
    normalizedName: string,
    country: string
  ): Promise<any | null> {
    const db = getBuyerDb();
    const tokens = normalizedName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (tokens.length === 0) return null;

    // Build regex for each significant token
    const regexParts = tokens.map(t => this.escapeRegex(t));
    const regexPattern = regexParts.join('.*');

    const candidates = await db.collection('enriched_buyers')
      .find({
        'verified_company.country': country,
        'verified_company.name': { $regex: new RegExp(regexPattern, 'i') },
        _id: { $ne: buyerId },
      })
      .limit(5)
      .toArray();

    for (const candidate of candidates) {
      const candidateName = (candidate.verified_company?.name || '').toLowerCase();
      const overlap = this.tokenOverlap(normalizedName.toLowerCase(), candidateName);
      if (overlap > 0.8) return candidate;
    }

    return null;
  }

  private tokenOverlap(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 1));
    const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 1));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let matches = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) matches++;
    }
    return matches / Math.max(tokensA.size, tokensB.size);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildDecision(
    buyerId: ObjectId, matchedWith: ObjectId | null,
    matchType: DedupDecision['match_type'], decision: DedupDecision['decision'],
    reason: string
  ): DedupDecision {
    return { buyer_id: buyerId, matched_with: matchedWith, match_type: matchType, decision, reason, checked_at: new Date() };
  }

  private async storeDecision(decision: DedupDecision): Promise<void> {
    const db = getBuyerDb();
    await db.collection('dedup_decisions').insertOne(decision);
    logger.info('Dedup decision', { buyerId: decision.buyer_id.toString(), decision: decision.decision, reason: decision.reason });
  }
}
