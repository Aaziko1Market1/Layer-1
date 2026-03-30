import { logger } from '../../config/logger';
import { braveSearchCompany } from '../enrichment/brave';
import { apolloSearchCompany } from '../enrichment/apollo';
import type { BuyerProfile } from '../../models/buyer';

/**
 * Web Researcher Agent — discovers company domain, website info,
 * and public intelligence via Brave Search + Apollo.
 */
export class WebResearcherAgent {
  async research(buyer: BuyerProfile): Promise<{
    domain: string | null;
    website_data: Record<string, unknown>;
    apollo_data: Record<string, unknown>;
  }> {
    logger.info('WebResearcher: researching', { buyer: buyer.buyer_name });

    // Step 1: Brave Search for domain discovery
    const braveResult = await braveSearchCompany(buyer.buyer_name, buyer.country);
    const domain = braveResult.status === 'success'
      ? (braveResult.data as any).likelyDomain || null
      : null;

    // Step 2: Apollo company enrichment
    const apolloResult = await apolloSearchCompany(buyer.buyer_name, domain || undefined);
    const apolloDomain = apolloResult.status === 'success'
      ? (apolloResult.data as any).domain || null
      : null;

    const finalDomain = domain || apolloDomain;

    logger.info('WebResearcher: done', {
      buyer: buyer.buyer_name,
      domain: finalDomain,
      brave: braveResult.status,
      apollo: apolloResult.status,
    });

    return {
      domain: finalDomain,
      website_data: braveResult.data as Record<string, unknown>,
      apollo_data: apolloResult.data as Record<string, unknown>,
    };
  }
}
