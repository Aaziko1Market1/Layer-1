import { logger } from '../../config/logger';
import { apolloFindContacts } from '../enrichment/apollo';
import { hunterDomainSearch, hunterExtractContacts } from '../enrichment/hunter';
import { snovDomainSearch, snovExtractContacts } from '../enrichment/snov';
import type { BuyerProfile } from '../../models/buyer';
import type { ContactInfo } from '../../types';

/**
 * Contact Finder Agent — discovers decision-maker contacts for a buyer.
 * Waterfall: Apollo → Hunter → Snov (fallback).
 */
export class ContactFinderAgent {
  async findContacts(buyer: BuyerProfile): Promise<ContactInfo[]> {
    logger.info('ContactFinder: searching', { buyer: buyer.buyer_name, domain: buyer.domain });
    const all: ContactInfo[] = [];

    // Apollo contacts
    const apolloContacts = await apolloFindContacts(buyer.buyer_name, buyer.domain || undefined);
    all.push(...apolloContacts);

    // Hunter if we have a domain
    if (buyer.domain) {
      const hunterResult = await hunterDomainSearch(buyer.domain);
      all.push(...hunterExtractContacts(hunterResult));
    }

    // Snov fallback if < 3 contacts
    if (all.length < 3 && buyer.domain) {
      const snovResult = await snovDomainSearch(buyer.domain);
      all.push(...snovExtractContacts(snovResult));
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const unique = all.filter(c => {
      if (!c.email || seen.has(c.email.toLowerCase())) return false;
      seen.add(c.email.toLowerCase());
      return true;
    });

    logger.info('ContactFinder: done', { buyer: buyer.buyer_name, found: unique.length });
    return unique;
  }
}
