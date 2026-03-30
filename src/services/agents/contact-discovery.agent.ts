import { BaseAgent } from './base.agent';
import { WebsiteScraperService } from '../scraping/website-scraper.service';
import { SnovService } from '../enrichment/snov.service';
import { ZeroBounceService } from '../enrichment/zerobounce.service';
import { apolloFindContacts } from '../enrichment/apollo';
import { hunterDomainSearch } from '../enrichment/hunter';
import { computeRoleRelevance } from '../../types';
import { logger } from '../../config/logger';
import type { BuyerProfile } from '../../types';

export interface Contact {
  name: string;
  title: string;
  email: string;
  email_verified: boolean;
  email_status: 'verified_safe' | 'verified_risky' | 'invalid' | 'unknown';
  email_confidence: number;
  email_source: 'apollo' | 'hunter' | 'snov' | 'website';
  linkedin: string | null;
  phone: string | null;
  phone_verified: boolean;
  role_relevance_score: number;
}

export interface ContactDiscoveryResult {
  contacts: Contact[];
  best_contact_index: number;
}

/**
 * Agent 2: Contact Discovery Agent
 * Discovers contacts using waterfall: Apollo → Hunter → Snov → Website
 */
export class ContactDiscoveryAgent extends BaseAgent {
  private scraper: WebsiteScraperService;
  private snovService: SnovService;
  private zeroBounceService: ZeroBounceService;

  constructor() {
    super('ContactDiscoveryAgent');
    this.scraper = new WebsiteScraperService();
    this.snovService = new SnovService();
    this.zeroBounceService = new ZeroBounceService();
  }

  /**
   * Discover contacts using waterfall strategy
   */
  async discover(profile: BuyerProfile): Promise<ContactDiscoveryResult> {
    const start = Date.now();
    this.logStart(profile.companyName, 'contact discovery');

    try {
      let contacts: Contact[] = [];

      // Step 1: Try Apollo (5s timeout)
      if (!contacts.length && profile.domain) {
        contacts = await this.safeExecute(
          () => this.withTimeout(() => this.tryApollo(profile.domain!, profile.companyName), 5000, 'Apollo API'),
          'Apollo API',
          []
        );
      }

      // Step 2: Try Hunter (5s timeout)
      if (!contacts.length && profile.domain) {
        contacts = await this.safeExecute(
          () => this.withTimeout(() => this.tryHunter(profile.domain!), 5000, 'Hunter API'),
          'Hunter API',
          []
        );
      }

      // Step 3: Try Snov (5s timeout)
      if (!contacts.length && profile.domain) {
        contacts = await this.safeExecute(
          () => this.withTimeout(() => this.trySnov(profile.domain!), 5000, 'Snov API'),
          'Snov API',
          []
        );
      }

      // Step 4: Try Website Scraping (10s timeout)
      if (!contacts.length && profile.verifiedWebsite) {
        contacts = await this.safeExecute(
          () =>
            this.withTimeout(
              () => this.tryWebsiteScraping(profile.verifiedWebsite!, profile.domain),
              10000,
              'Website Scraping'
            ),
          'Website Scraping',
          []
        );
      }

      // If no contacts found, return empty result
      if (contacts.length === 0) {
        this.logComplete(profile.companyName, 'contact discovery (no contacts)', Date.now() - start);
        return { contacts: [], best_contact_index: -1 };
      }

      // Step 5: Score role relevance
      contacts = contacts.map((c) => ({
        ...c,
        role_relevance_score: computeRoleRelevance(c.title),
      }));

      // Step 6: Verify emails (batch)
      contacts = await this.verifyEmails(contacts);

      // Step 7: Sort by role relevance and select best
      contacts.sort((a, b) => b.role_relevance_score - a.role_relevance_score);
      const best_contact_index = 0;

      this.logComplete(profile.companyName, 'contact discovery', Date.now() - start);
      return { contacts: contacts.slice(0, 10), best_contact_index };
    } catch (err: any) {
      this.logError(profile.companyName, 'contact discovery', err.message);
      return { contacts: [], best_contact_index: -1 };
    }
  }

  /**
   * Try Apollo API
   * NOTE: Apollo free plan does NOT support /mixed_people/search endpoint
   * This will always return empty array unless you have a paid plan
   */
  private async tryApollo(domain: string, companyName?: string): Promise<Contact[]> {
    try {
      const contactInfos = await apolloFindContacts(companyName || '', domain);

      if (contactInfos.length === 0) {
        logger.debug(`Apollo: No contacts found for domain ${domain} (likely free plan limitation)`);
        return [];
      }

      const contacts: Contact[] = contactInfos
        .filter((c) => c.email)
        .map((c) => ({
          name: c.name || 'Unknown',
          title: c.title || 'Unknown',
          email: c.email,
          email_verified: c.emailVerified,
          email_status: 'unknown' as const,
          email_confidence: 0.7,
          email_source: 'apollo' as const,
          linkedin: c.linkedin,
          phone: c.phone,
          phone_verified: false,
          role_relevance_score: 0,
        }))
        .slice(0, 10);

      logger.info(`Apollo: Found ${contacts.length} contacts for domain ${domain}`);
      return contacts;
    } catch (err: any) {
      // Apollo free plan returns error for contact search - this is expected
      logger.debug(`Apollo API unavailable for ${domain}: ${err.message}`);
      return [];
    }
  }

  /**
   * Try Hunter API
   */
  private async tryHunter(domain: string): Promise<Contact[]> {
    try {
      const result = await hunterDomainSearch(domain);

      if (result.status === 'not_found') {
        logger.debug(`Hunter: Domain ${domain} not found in database (valid for regional/small companies)`);
        return [];
      }

      if (result.status !== 'success' || !result.data.emails) {
        logger.debug(`Hunter: No contacts for ${domain}, status: ${result.status}`);
        return [];
      }

      const contacts: Contact[] = (result.data.emails as any[])
        .filter((e: any) => e.value)
        .map((e: any) => ({
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown',
          title: e.position || 'Unknown',
          email: e.value,
          email_verified: e.verification?.status === 'valid',
          email_status: this.mapHunterStatus(e.verification?.status),
          email_confidence: e.confidence || 0.5,
          email_source: 'hunter' as const,
          linkedin: e.linkedin || null,
          phone: e.phone_number || null,
          phone_verified: false,
          role_relevance_score: 0,
        }))
        .slice(0, 10);

      logger.info(`Hunter: Found ${contacts.length} contacts for domain ${domain}`);
      return contacts;
    } catch (err: any) {
      logger.debug(`Hunter API error for ${domain}: ${err.message}`);
      return [];
    }
  }

  /**
   * Try Snov API
   */
  private async trySnov(domain: string): Promise<Contact[]> {
    try {
      const result = await this.snovService.searchByDomain(domain);

      if (!result.success || result.contacts.length === 0) {
        return [];
      }

      const contacts: Contact[] = result.contacts.map((c) => ({
        name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        title: c.position || 'Unknown',
        email: c.email,
        email_verified: false,
        email_status: 'unknown' as const,
        email_confidence: 0.6,
        email_source: 'snov' as const,
        linkedin: null,
        phone: null,
        phone_verified: false,
        role_relevance_score: 0,
      }));

      return contacts.slice(0, 10);
    } catch (err: any) {
      logger.debug(`Snov API error for ${domain}: ${err.message}`);
      return [];
    }
  }

  /**
   * Try website scraping
   */
  private async tryWebsiteScraping(websiteUrl: string, domain: string | null): Promise<Contact[]> {
    try {
      const scraped = await this.scraper.scrapeWebsite(websiteUrl);

      if (scraped.contacts.emails.length === 0) {
        return [];
      }

      // Filter emails to only include company domain
      const companyEmails = domain
        ? scraped.contacts.emails.filter((email) => email.toLowerCase().includes(domain.toLowerCase()))
        : scraped.contacts.emails;

      const contacts: Contact[] = companyEmails.map((email) => ({
        name: 'Unknown',
        title: 'Unknown',
        email,
        email_verified: false,
        email_status: 'unknown' as const,
        email_confidence: 0.4,
        email_source: 'website' as const,
        linkedin: null,
        phone: scraped.contacts.phones[0] || null,
        phone_verified: false,
        role_relevance_score: 0,
      }));

      return contacts.slice(0, 10);
    } catch (err: any) {
      logger.debug(`Website scraping error for ${websiteUrl}: ${err.message}`);
      return [];
    }
  }

  /**
   * Verify emails using ZeroBounce
   */
  private async verifyEmails(contacts: Contact[]): Promise<Contact[]> {
    try {
      const emails = contacts.map((c) => c.email);
      const results = await this.zeroBounceService.verifyBatch(emails);

      return contacts.map((contact, index) => {
        const verification = results[index];
        if (verification) {
          return {
            ...contact,
            email_verified: verification.verified,
            email_status: verification.status,
            email_confidence: verification.confidence,
          };
        }
        return contact;
      });
    } catch (err: any) {
      logger.debug(`Email verification error: ${err.message}`);
      return contacts;
    }
  }

  /**
   * Map Hunter verification status to our status
   */
  private mapHunterStatus(
    status: string | undefined
  ): 'verified_safe' | 'verified_risky' | 'invalid' | 'unknown' {
    switch (status) {
      case 'valid':
        return 'verified_safe';
      case 'accept_all':
        return 'verified_risky';
      case 'invalid':
        return 'invalid';
      default:
        return 'unknown';
    }
  }
}

