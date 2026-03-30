import { logger } from '../../config/logger';
import { braveSearchCompany } from '../enrichment/brave';
import { apolloSearchCompany } from '../enrichment/apollo';
import { hunterDomainSearch } from '../enrichment/hunter';
import {
  cleanCompanyName,
  toDomainFormat,
  getCountryTLD,
  isSocialMediaOrDirectory,
  extractDomain,
  isValidUrl,
  extractDomainFromEmail,
} from './utils';
import type {
  DiscoveryInput,
  DiscoveryResult,
  WebsiteCandidate,
} from '../../types';

/**
 * Website Discovery Service
 * Finds candidate websites for a buyer company from multiple sources:
 * 1. Domain inference (company name → domain patterns)
 * 2. Brave Search API
 * 3. Apollo.io API
 * 4. Hunter.io API
 * 5. Trade data email extraction
 */
export class WebsiteDiscoveryService {
  /**
   * Blacklist of domains to exclude (trade data sites, directories, etc.)
   */
  private readonly BLACKLIST_DOMAINS = [
    // Trade data aggregators
    'volza.com',
    'importgenius.com',
    'panjiva.com',
    'trademap.org',
    'zauba.com',
    'seair.co.in',
    'infodriveindia.com',
    'eximpedia.app',
    'tradeimex.in',
    'exportgenius.in',
    // Social media
    'linkedin.com',
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'youtube.com',
    // Directories & databases
    'wikipedia.org',
    'bloomberg.com',
    'crunchbase.com',
    'dnb.com',
    'zoominfo.com',
    'hoovers.com',
    'manta.com',
    'yellowpages.com',
    // Job sites
    'indeed.com',
    'glassdoor.com',
    'monster.com',
    // Contact/People search sites (NEW!)
    'signalhire.com',
    'rocketreach.com',
    'contactout.com',
    'lusha.com',
    'hunter.io',
    'snov.io',
    'apollo.io',
    'clearbit.com',
    'fullcontact.com',
  ];
  /**
   * Main discovery function - orchestrates all discovery methods
   */
  async discoverWebsites(input: DiscoveryInput): Promise<DiscoveryResult> {
    const { companyName, country } = input;
    
    logger.info('Starting website discovery', { companyName, country });
    
    const candidates: WebsiteCandidate[] = [];
    
    try {
      // Method 1: Domain inference
      const inferredDomains = this.inferDomains(companyName, country);
      for (const domain of inferredDomains) {
        // Skip blacklisted domains
        if (this.isBlacklisted(domain)) {
          continue;
        }
        
        candidates.push({
          domain,
          url: `https://${domain}`,
          source: 'domain_inference',
          priority: 3,
          discoveredAt: new Date(),
        });
      }
      
      // Method 2: Brave Search
      const braveResults = await this.searchBrave(companyName, country);
      candidates.push(...braveResults);
      
      // Method 3: Apollo.io - DISABLED
      // Apollo requires a domain to enrich, it cannot discover domains by company name
      // The API returns 422 error when called without a domain
      // Apollo is only used later in the enrichment phase when we already have a domain
      
      // Method 4: Hunter.io
      const hunterDomain = await this.queryHunter(companyName);
      if (hunterDomain && !this.isBlacklisted(hunterDomain)) {
        candidates.push({
          domain: hunterDomain,
          url: `https://${hunterDomain}`,
          source: 'hunter',
          priority: 5, // High priority - from API
          discoveredAt: new Date(),
        });
      }
      
      // Method 5: Trade data emails
      if (input.tradeEmails && input.tradeEmails.length > 0) {
        const tradeDomains = this.extractDomainsFromTradeData(input.tradeEmails);
        for (const domain of tradeDomains) {
          // Skip blacklisted domains
          if (this.isBlacklisted(domain)) {
            continue;
          }
          
          candidates.push({
            domain,
            url: `https://${domain}`,
            source: 'trade_data',
            priority: 4,
            discoveredAt: new Date(),
          });
        }
      }
      
      // Deduplicate and limit to 5
      const uniqueCandidates = this.deduplicateCandidates(candidates);
      
      logger.info('Website discovery completed', {
        companyName,
        candidatesFound: uniqueCandidates.length,
      });
      
      return {
        candidates: uniqueCandidates,
        bestMatch: uniqueCandidates.length > 0 ? uniqueCandidates[0] : null,
        candidatesFound: uniqueCandidates.length,
      };
    } catch (err: any) {
      logger.error('Website discovery failed', {
        companyName,
        error: err.message,
      });
      
      return {
        candidates: [],
        bestMatch: null,
        candidatesFound: 0,
      };
    }
  }
  
  /**
   * Search Brave for company website
   * Query: "{company_name} {country} official website"
   * Returns top 5 non-social-media results
   */
  async searchBrave(companyName: string, country: string): Promise<WebsiteCandidate[]> {
    const candidates: WebsiteCandidate[] = [];
    
    try {
      const result = await braveSearchCompany(companyName, country);
      
      if (result.status !== 'success' || !result.data.allDomains) {
        logger.warn('Brave search returned no results', { companyName, status: result.status });
        return candidates;
      }
      
      const domains = result.data.allDomains as string[];
      
      // Filter out social media and directory sites
      const filteredDomains = this.filterSocialMedia(domains);
      
      // Convert to candidates (limit to 5)
      for (const domain of filteredDomains.slice(0, 5)) {
        candidates.push({
          domain,
          url: `https://${domain}`,
          source: 'brave_search',
          priority: 5, // High priority - from search results
          discoveredAt: new Date(),
        });
      }
      
      logger.info('Brave search completed', {
        companyName,
        candidatesFound: candidates.length,
      });
    } catch (err: any) {
      logger.error('Brave search failed', {
        companyName,
        error: err.message,
      });
    }
    
    return candidates;
  }
  
  /**
   * Query Apollo.io for company website
   * Returns domain if found
   */
  async queryApollo(companyName: string): Promise<string | null> {
    try {
      const result = await apolloSearchCompany(companyName);
      
      if (result.status === 'success' && result.data.domain) {
        const domain = result.data.domain as string;
        logger.info('Apollo returned domain', { companyName, domain });
        return domain;
      }
      
      logger.warn('Apollo returned no domain', { companyName, status: result.status });
      return null;
    } catch (err: any) {
      logger.error('Apollo query failed', { companyName, error: err.message });
      return null;
    }
  }
  
  /**
   * Query Hunter.io for company domain
   * Note: Hunter requires a domain to search, so we try inferred domains first
   */
  async queryHunter(companyName: string): Promise<string | null> {
    try {
      // Try to infer a domain first (Hunter needs a domain to search)
      const inferredDomains = this.inferDomains(companyName, '');
      
      if (inferredDomains.length === 0) {
        return null;
      }
      
      // Try the first inferred domain
      const testDomain = inferredDomains[0];
      const result = await hunterDomainSearch(testDomain);
      
      if (result.status === 'success' && result.data.domain) {
        const domain = result.data.domain as string;
        logger.info('Hunter confirmed domain', { companyName, domain });
        return domain;
      }
      
      logger.warn('Hunter returned no domain', { companyName, status: result.status });
      return null;
    } catch (err: any) {
      logger.error('Hunter query failed', { companyName, error: err.message });
      return null;
    }
  }
  
  /**
   * Filter out social media, directory sites, and blacklisted domains
   */
  filterSocialMedia(domains: string[]): string[] {
    return domains.filter(domain => {
      // Check built-in social media filter
      if (isSocialMediaOrDirectory(domain)) {
        return false;
      }
      
      // Check blacklist
      const isBlacklisted = this.BLACKLIST_DOMAINS.some(blacklisted => 
        domain.includes(blacklisted) || blacklisted.includes(domain)
      );
      
      if (isBlacklisted) {
        logger.debug('Filtered blacklisted domain', { domain });
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Infer likely domains from company name
   * Example: 'DOW EUROPE GMBH' -> ['dow.com', 'doweurope.com', 'dow.de']
   */
  inferDomains(companyName: string, country: string): string[] {
    const domains: string[] = [];
    
    // Clean company name (remove legal suffixes)
    const cleaned = cleanCompanyName(companyName);
    const domainBase = toDomainFormat(cleaned);
    
    if (!domainBase || domainBase.length < 2) {
      return domains;
    }
    
    // Try .com (most common)
    domains.push(`${domainBase}.com`);
    
    // Try country TLD
    const countryTLD = getCountryTLD(country);
    if (countryTLD) {
      domains.push(`${domainBase}.${countryTLD}`);
    }
    
    // Try first word only (for multi-word companies)
    const words = cleaned.split(/\s+/);
    if (words.length > 1) {
      const firstWord = toDomainFormat(words[0]);
      if (firstWord && firstWord.length >= 3) {
        domains.push(`${firstWord}.com`);
        if (countryTLD) {
          domains.push(`${firstWord}.${countryTLD}`);
        }
      }
    }
    
    // Remove duplicates
    return [...new Set(domains)];
  }
  
  /**
   * Extract domains from trade data email addresses
   */
  extractDomainsFromTradeData(emails: string[]): string[] {
    const domains = new Set<string>();
    
    for (const email of emails) {
      const domain = extractDomainFromEmail(email);
      if (domain && !isSocialMediaOrDirectory(domain)) {
        domains.add(domain);
      }
    }
    
    return Array.from(domains);
  }
  
  /**
   * Deduplicate candidates and limit to 5
   * Prioritize by source priority (higher = better)
   */
  deduplicateCandidates(candidates: WebsiteCandidate[]): WebsiteCandidate[] {
    // Group by domain
    const domainMap = new Map<string, WebsiteCandidate>();
    
    for (const candidate of candidates) {
      const existing = domainMap.get(candidate.domain);
      
      // Keep the one with higher priority
      if (!existing || candidate.priority > existing.priority) {
        domainMap.set(candidate.domain, candidate);
      }
    }
    
    // Convert to array and sort by priority (descending)
    const unique = Array.from(domainMap.values()).sort(
      (a, b) => b.priority - a.priority
    );
    
    // Limit to 5
    return unique.slice(0, 5);
  }
  
  /**
   * Check if domain is blacklisted
   */
  private isBlacklisted(domain: string): boolean {
    const cleanDomain = domain.toLowerCase().replace('www.', '');
    return this.BLACKLIST_DOMAINS.some(blacklisted => 
      cleanDomain.includes(blacklisted) || blacklisted.includes(cleanDomain)
    );
  }
}
