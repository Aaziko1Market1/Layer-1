import { BaseAgent } from './base.agent';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { markSerperExhausted, serperStatus } from '../../state/serper-status';
import axios from 'axios';
import http from 'http';
import https from 'https';
import type { BuyerProfile } from '../../types';

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

interface ContactDetail {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  website: string | null;
  address: string | null;
  source: string;
}

/**
 * Sequential Enrichment Agent — WATERFALL approach.
 *
 * Sends company_name + country to each step one by one.
 * As soon as a step returns ANY contact detail (email, phone, LinkedIn,
 * person name+title, website, address) → STOP → go to ZeroBounce.
 * If a step returns nothing useful → move to next step.
 */
export class SequentialEnrichmentAgent extends BaseAgent {
  constructor() {
    super('SequentialEnrichmentAgent');
  }

  private static readonly GENERIC_PREFIXES = ['info', 'contact', 'sales', 'hello', 'support', 'enquiry', 'inquiry', 'office', 'admin', 'general', 'reception', 'hr'];

  /** Strong contact: personal email or phone — enough to stop the waterfall */
  private hasStrongContact(contacts: ContactDetail[]): boolean {
    return contacts.some(c => {
      if (c.phone) return true;
      if (c.email) {
        const prefix = c.email.split('@')[0]?.toLowerCase();
        return !SequentialEnrichmentAgent.GENERIC_PREFIXES.includes(prefix);
      }
      return false;
    });
  }

  /** Any contact signal including LinkedIn, website, address */
  private hasAnyContact(contacts: ContactDetail[]): boolean {
    return contacts.some(c => c.email || c.phone || c.linkedin || c.name || c.website || c.address);
  }

  async enrich(profile: BuyerProfile): Promise<any> {
    const start = Date.now();
    const companyName = profile.companyName;
    const country = profile.country;
    this.logStart(companyName, 'free-only enrichment');

    const result: any = {
      company_name: companyName,
      country,
      steps: {},
      stopped_at_step: null,
      contacts_found: [],
      domain_found: null,
    };

    let contacts: ContactDetail[] = [];
    let domain: string | null = profile.domain || null;

    try {
      // ── ALL 3 SCRAPERS RUN IN TRUE PARALLEL ────────────────────────────
      // Google (Serper.dev) + Global API (Webshare website scraper) + Apollo free
      // Total time = slowest scraper, not sum.
      logger.info(`[PARALLEL] Launching all 3 scrapers for: ${companyName}`);
      const parallelStart = Date.now();

      // Run Google first (fast ~3-8s) to find website, then pass it to Global
      // so it can skip its internal (broken) Google search and directly scrape the site.
      const googleResult = await this.callGoogleAPI(companyName, country)
        .then(r => { logger.info(`✅ [Google done] ${companyName} (${Date.now()-parallelStart}ms)`); return r; })
        .catch((e: any) => { logger.warn(`⚠️ [Google fail] ${e.message}`); return { success: false, results: [], business_info: {} }; });

      // Inject known domain from buyer profile if Google didn't find a website
      if (!googleResult.business_info?.website && domain) {
        const knownUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        googleResult.business_info = googleResult.business_info || {};
        googleResult.business_info.website = knownUrl;
        logger.info(`Using known domain from profile: ${knownUrl}`);
      }

      const [globalResult, apolloResult] = await Promise.all([
        // ── Global API (pass website URL found by Google to skip internal search) ──
        this.callGlobalAPI(companyName, country, googleResult)
          .then(r => { logger.info(`✅ [Global done] ${companyName} — scraped ${r.data?.stats?.scraped || 0} pages (${Date.now()-parallelStart}ms)`); return r; })
          .catch((e: any) => { logger.warn(`⚠️ [Global fail] ${e.message}`); return { success: false, data: null }; }),

        // ── Apollo free ───────────────────────────────────────────────
        this.callApolloFreeAPI(companyName, domain)
          .then(r => { logger.info(`✅ [Apollo done] ${companyName} (${Date.now()-parallelStart}ms)`); return r; })
          .catch((e: any) => { logger.warn(`⚠️ [Apollo fail] ${e.message}`); return { success: false, contacts: [], domain: null }; }),
      ]);

      logger.info(`[ALL done] ${companyName} — total ${Date.now()-parallelStart}ms`);

      // ── Process Google results ──────────────────────────────────────
      result.steps.google = googleResult;
      const g = this.extractFromSearchResults(googleResult.results || []);
      if (g.domain) domain = g.domain;
      contacts.push(...g.contacts);
      const biz = googleResult.business_info || {};
      if (biz.website && !domain) {
        try { domain = new URL(biz.website).hostname.replace(/^www\./, ''); } catch { /* skip */ }
      }
      if (biz.phone || biz.address || biz.website) {
        contacts.push({
          name: biz.name || null, title: null,
          email: null, phone: biz.phone || null,
          linkedin: null, website: biz.website || null,
          address: biz.address || null, source: 'google_business',
        });
      }

      // ── Process Global API results ──────────────────────────────────
      result.steps.global = globalResult;
      const gl = this.extractFromGlobal(globalResult.data || {});
      if (gl.domain) domain = gl.domain;
      contacts.push(...gl.contacts);

      // ── Process Apollo results ──────────────────────────────────────
      result.steps.apollo = apolloResult;
      if (apolloResult.domain) domain = apolloResult.domain;
      contacts.push(...(apolloResult.contacts || []));

      // Extract domain from emails if still missing
      if (!domain) {
        domain = this.domainFromEmails(contacts);
        if (domain) logger.info(`📧 Extracted domain from email: ${domain}`);
      }

      result.contacts_found = contacts;
      result.domain_found = domain;

      const totalFound = contacts.filter(c => c.email || c.phone || c.linkedin || c.name).length;
      if (totalFound > 0) {
        logger.info(`✅ Total contacts for ${companyName}: ${totalFound} (email/phone/linkedin/name)`);
      } else {
        logger.warn(`⚠️ No contacts found for ${companyName}`);
        result.stopped_at_step = 'No contacts found';
      }

      result.status = 'complete';
      result.completed_at = new Date().toISOString();
      this.logComplete(companyName, 'free-only enrichment', Date.now() - start);
      return result;
    } catch (err: any) {
      this.logError(companyName, 'free-only enrichment', err.message);
      result.status = 'failed';
      result.error = err.message;
      return result;
    }
  }

  // ── Helpers ──

  private static readonly TEMPLATE_EMAILS = /^(first\.last|your\.name|your\.email|name\.surname|firstname\.lastname|yourname|user|test|example|noreply|no-reply|sample|email|mail)\@/i;
  private static readonly BLACKLIST_EMAIL_DOMAINS = ['example.com', 'test.com', 'sentry.io', 'github.com'];

  private isRealEmail(email: string): boolean {
    if (!email || !email.includes('@')) return false;
    if (SequentialEnrichmentAgent.TEMPLATE_EMAILS.test(email)) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    if (SequentialEnrichmentAgent.BLACKLIST_EMAIL_DOMAINS.includes(domain)) return false;
    // Also reject emails from aggregator/directory domains (same list used for URLs)
    if (this.SKIP_DOMAINS.some(s => domain === s || domain.endsWith('.' + s))) return false;
    return true;
  }

  /** Try to extract domain from email addresses if URL-based domain is missing */
  private domainFromEmails(contacts: ContactDetail[]): string | null {
    for (const c of contacts) {
      if (c.email && this.isRealEmail(c.email)) {
        const d = c.email.split('@')[1]?.toLowerCase();
        if (d && !SequentialEnrichmentAgent.BLACKLIST_EMAIL_DOMAINS.includes(d) && !this.SKIP_DOMAINS.some(s => d.includes(s))) {
          return d;
        }
      }
    }
    return null;
  }

  // ── Extractors ──

  private extractFromSearchResults(results: any[]): { contacts: ContactDetail[]; domain: string | null } {
    const contacts: ContactDetail[] = [];
    let domain: string | null = null;
    const seenEmails = new Set<string>();

    for (const r of results) {
      const text = `${r.title || ''} ${r.description || ''} ${r.url || ''}`;

      // Extract emails — skip template/placeholder patterns
      const foundEmails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      for (const email of foundEmails) {
        const e = email.toLowerCase();
        if (!seenEmails.has(e) && this.isRealEmail(e)) {
          seenEmails.add(e);
          contacts.push({ name: null, title: null, email: e, phone: null, linkedin: null, website: null, address: null, source: 'search' });
        }
      }

      // Extract phone numbers (require + prefix or at least 10 digits to reduce false positives)
      const phones = text.match(/\+\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [];
      for (const phone of phones) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) {
          contacts.push({ name: null, title: null, email: null, phone: phone.replace(/\s+/g, ''), linkedin: null, website: null, address: null, source: 'search' });
        }
      }

      // Extract LinkedIn URLs
      const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9_-]+/gi) || [];
      for (const li of linkedinMatch) {
        contacts.push({ name: null, title: null, email: null, phone: null, linkedin: li, website: null, address: null, source: 'search' });
      }

      // Extract domain (company website) — use full blacklist
      if (!domain && r.url) {
        try {
          const d = new URL(r.url).hostname.replace(/^www\./, '');
          if (!this.SKIP_DOMAINS.some(s => d.includes(s))) {
            domain = d;
            contacts.push({ name: null, title: null, email: null, phone: null, linkedin: null, website: r.url, address: null, source: 'search' });
          }
        } catch { /* skip */ }
      }
    }
    return { contacts, domain };
  }

  private extractFromGlobal(data: any): { contacts: ContactDetail[]; domain: string | null } {
    const contacts: ContactDetail[] = [];
    let domain: string | null = null;
    if (!data) return { contacts, domain };

    const text = JSON.stringify(data);

    // Emails
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const seen = new Set<string>();
    for (const email of emails) {
      const e = email.toLowerCase();
      if (!seen.has(e) && this.isRealEmail(e)) {
        seen.add(e);
        contacts.push({ name: null, title: null, email: e, phone: null, linkedin: null, website: null, address: null, source: 'global_api' });
      }
    }

    // Phones (require + prefix to reduce false positives from JSON numbers)
    const phones = text.match(/\+\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [];
    for (const phone of phones) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        contacts.push({ name: null, title: null, email: null, phone: phone.replace(/\s+/g, ''), linkedin: null, website: null, address: null, source: 'global_api' });
      }
    }

    // LinkedIn
    const linkedins = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9_-]+/gi) || [];
    for (const li of linkedins) {
      contacts.push({ name: null, title: null, email: null, phone: null, linkedin: li, website: null, address: null, source: 'global_api' });
    }

    // Domain / website
    if (data.domain) domain = data.domain;
    else if (data.website) {
      try { domain = new URL(data.website).hostname.replace(/^www\./, ''); } catch { /* skip */ }
    }
    if (data.website) {
      contacts.push({ name: null, title: null, email: null, phone: null, linkedin: null, website: data.website, address: null, source: 'global_api' });
    }

    // Address
    if (data.address) {
      contacts.push({ name: null, title: null, email: null, phone: null, linkedin: null, website: null, address: data.address, source: 'global_api' });
    }

    // Contact name/title from structured data
    if (data.contacts && Array.isArray(data.contacts)) {
      for (const c of data.contacts) {
        contacts.push({
          name: c.name || c.full_name || null,
          title: c.title || c.position || c.role || null,
          email: c.email || null,
          phone: c.phone || c.phone_number || null,
          linkedin: c.linkedin || c.linkedin_url || null,
          website: null, address: null,
          source: 'global_api',
        });
      }
    }

    // Contacts extracted directly from MongoDB scraped page content
    if (data._mongo_contacts && Array.isArray(data._mongo_contacts)) {
      contacts.push(...data._mongo_contacts);
    }

    return { contacts, domain };
  }

  private extractFromApollo(apollo: any): ContactDetail[] {
    // apollo.contacts is now pre-built org-level contacts from callApolloAPI
    return (apollo.contacts || []) as ContactDetail[];
  }

  private extractFromHunter(hunter: any): ContactDetail[] {
    const contacts: ContactDetail[] = [];
    for (const e of (hunter.emails || [])) {
      const hasInfo = e.value || e.linkedin || e.phone_number || e.first_name;
      if (hasInfo) {
        contacts.push({
          name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
          title: e.position || null,
          email: e.value || null,
          phone: e.phone_number || null,
          linkedin: e.linkedin || null,
          website: null, address: null,
          source: 'hunter',
        });
      }
    }
    return contacts;
  }

  private extractFromSnov(snov: any, searchedDomain?: string): ContactDetail[] {
    const contacts: ContactDetail[] = [];
    for (const e of (snov.emails || [])) {
      const hasInfo = e.email || e.firstName || e.lastName;
      if (!hasInfo || !this.isRealEmail(e.email || '')) continue;
      // Cross-domain guard: if searched domain is known, reject emails not from it
      if (searchedDomain && e.email) {
        const emailDomain = e.email.split('@')[1]?.toLowerCase();
        if (emailDomain && emailDomain !== searchedDomain.toLowerCase()) continue;
      }
      contacts.push({
        name: [e.firstName, e.lastName].filter(Boolean).join(' ') || null,
        title: e.position || e.title || null,
        email: e.email || null,
        phone: null, linkedin: e.linkedin || null,
        website: null, address: null,
        source: 'snov',
      });
    }
    return contacts;
  }

  private readonly SKIP_DOMAINS = [
    // Social / general web
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
    'google.com', 'bing.com', 'yahoo.com', 'wikipedia.org', 'reddit.com', 'pinterest.com',
    'tiktok.com', 'whatsapp.com', 'telegram.org',
    // Business news / finance
    'bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com', 'forbes.com', 'fortune.com',
    'businesswire.com', 'prnewswire.com', 'marketwatch.com',
    // Company directories / databases
    'crunchbase.com', 'glassdoor.com', 'indeed.com', 'dnb.com', 'zoominfo.com',
    'hoovers.com', 'manta.com', 'yellowpages.com', 'whitepages.com',
    'kompass.com', 'thomasnet.com', 'europages.com', 'europages.co.uk',
    'opencorporates.com', 'companieshouse.gov.uk', 'annualreportsguru.com',
    'tofler.in', 'zaubacorp.com', 'ambitionbox.com', 'bvdinfo.com', 'orbis.bvdinfo.com',
    'theorg.com', 'owler.com', 'craft.co', 'emis.com', 'cybo.com',
    // Trade data / import-export aggregators
    'volza.com', 'importgenius.com', 'panjiva.com', 'trademap.org', 'zauba.com',
    'seair.co.in', 'infodriveindia.com', 'eximpedia.app', 'tradeimex.in', 'exportgenius.in',
    'tendata.com', '52wmb.com', 'marketinsidedata.com', 'trademo.com', 'tradeint.com',
    'importyeti.com', 'usimportdata.com', 'tradeatlas.com', 'tradekey.com',
    'globaltradealert.org', 'globaldata.com', 'statista.com',
    // Lead gen / contact enrichment tools
    'leadiq.com', 'clearbit.com', 'adapt.io', 'seamless.ai', 'salesloft.com',
    'datanyze.com', 'uplead.com', 'cognism.com', 'snov.io', 'hunter.io',
    'getprospect.com', 'wiza.co', 'skrapp.io', 'findthatlead.com', 'anymail.io',
    'signalhire.com', 'rocketreach.co', 'rocketreach.com', 'contactout.com', 'lusha.com',
    'apollo.io', 'emailable.com', 'neverbounce.com', 'zerobounce.net',
    // Data/contact broker aggregators (wrongly appearing in scraper results)
    'freshdi.com', 'globaldatabase.com', 'readycontacts.com', 'infobel.com',
    'businessdatagroup.com', 'datarade.ai', 'coldleads.com', 'salesfully.com',
    'bookyourdata.com', 'megaleads.com', 'b2bdata.com', 'b2bleads.com',
    'emaildatabase.com', 'leadsbridge.com', 'd7leadsearch.com',
    // More aggregators found in scraping results
    'dataintelo.com', 'bridgia.africa', 'estategh.com', 'businesslist.com.gh',
    'companieshouse.id', 'companieshouse.com', 'opencorp.id',
    'bizapedia.com', 'corporationwiki.com', 'companycheck.co.uk',
    'endole.co.uk', 'duedil.com', 'companieshouse.com.au',
    // Reviews / software directories
    'yelp.com', 'bbb.org', 'trustpilot.com', 'g2.com', 'capterra.com',
    'softwareadvice.com', 'clutch.co',
    // E-commerce / marketplaces
    'alibaba.com', 'aliexpress.com', 'indiamart.com', 'tradeindia.com',
    'made-in-china.com', 'amazon.com', 'ebay.com',
    // Government / international orgs
    'sec.gov', 'state.gov', 'wto.org', 'unctad.org', 'worldbank.org',
    'imf.org', 'un.org',
  ];

  private pickDomain(results: any[]): string | null {
    for (const r of results) {
      if (r.url) {
        try {
          const d = new URL(r.url).hostname.replace(/^www\./, '');
          if (d && !this.SKIP_DOMAINS.some(s => d.includes(s)) && this.isValidDomain(d)) return d;
        } catch { /* skip */ }
      }
    }
    return null;
  }

  // ── API Calls ──

  /** Serper.dev Google Search — primary search engine */
  private async callGoogleAPI(companyName: string, country: string): Promise<any> {
    const key = process.env.SERPER_API_KEY || env.SERPER_API_KEY;
    if (!key || serperStatus.creditsExhausted) {
      logger.warn(`⚠️ Serper key missing or credits exhausted — skipping Google step`);
      return { success: false, results: [], business_info: {} };
    }
    try {
      const query = `"${companyName}" ${country} contact email phone`;
      const [orgResp, mapsResp] = await Promise.allSettled([
        axios.post('https://google.serper.dev/search',
          { q: query, num: 10, gl: 'us', hl: 'en' },
          { headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 12000 }
        ),
        axios.post('https://google.serper.dev/places',
          { q: `${companyName} ${country}`, gl: 'us', hl: 'en' },
          { headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 12000 }
        ),
      ]);

      const orgData = orgResp.status === 'fulfilled' ? orgResp.value.data : {};
      if (orgData.statusCode === 400 || orgData.message?.toLowerCase().includes('credit')) {
        markSerperExhausted();
        logger.warn(`🔑 Serper credits exhausted — add a new key to resume`);
        return { success: false, results: [], business_info: {} };
      }

      const raw = orgData.organic || [];
      const results = raw.map((r: any) => ({
        title: r.title || '',
        url: r.link || '',
        description: r.snippet || '',
      }));

      const kg = orgData.knowledgeGraph || {};
      const ab = orgData.answerBox || {};
      const placesData = mapsResp.status === 'fulfilled' ? mapsResp.value.data : {};
      const place = (placesData.places || [])[0] || {};
      const biz: any = {
        name: kg.title || place.title || ab.title || null,
        phone: place.phoneNumber || kg.attributes?.Phone || null,
        address: place.address || kg.attributes?.Address || null,
        website: place.website || kg.website || null,
        rating: place.rating ? String(place.rating) : null,
        description: kg.description || ab.snippet || null,
      };
      if (biz.website && !results.find((r: any) => r.url === biz.website)) {
        results.unshift({ title: biz.name || companyName, url: biz.website, description: biz.description || '' });
      }
      logger.info(`✅ Serper.dev: ${results.length} results | phone=${biz.phone || 'none'} | website=${biz.website || 'none'}`);
      return { success: results.length > 0, results, count: results.length, business_info: biz };
    } catch (err: any) {
      logger.warn(`⚠️ Serper.dev error: ${err.message}`);
      return { success: false, error: err.message, results: [], business_info: {} };
    }
  }

  private async callGlobalAPI(companyName: string, country: string, googleData: any): Promise<any> {
    try {
      // Pass Serper-found URL if available (skips Global API's internal Google search).
      const serperWebsite = googleData?.business_info?.website ||
        (googleData?.results || []).find((r: any) => r.url?.startsWith('http'))?.url || null;

      const payload: Record<string, any> = {
        keyword: `${companyName} ${country} contact email phone`,
        num_websites: 2,
        max_urls_per_site: 4,
      };
      if (serperWebsite) {
        payload.urls = [serperWebsite];
        logger.info(`Global API: using Serper URL → ${serperWebsite}`);
      }

      const globalBase = process.env.GLOBAL_SCRAPER_URL || env.GLOBAL_SCRAPER_URL;
      const submitResp = await axios.post(
        `${globalBase}/api/v1/scrape/global`,
        payload,
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const taskId = submitResp.data?.task_id;
      if (!taskId) throw new Error('No task_id returned');

      logger.info(`Global API: task ${taskId} queued — polling for results`);
      const pollStart = Date.now();
      const maxWait = 60000; // 60s max
      while (Date.now() - pollStart < maxWait) {
        await this.sleep(5000);
        try {
          const statusResp = await axios.get(
            `${globalBase}/api/v1/task/${taskId}`,
            { timeout: 8000 }
          );
          const s = statusResp.data;
          if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
            const result = s.result || {};
            const scraped = result.stats?.scraped || 0;
            logger.info(`✅ Global API: task done — scraped ${scraped} pages`);

            // Query MongoDB for the actual scraped page content (emails, phones, text)
            const mongoContacts = await this.extractContactsFromMongo(taskId, companyName);
            if (mongoContacts.length > 0) {
              logger.info(`📧 MongoDB: found ${mongoContacts.length} contacts from scraped pages`);
              result._mongo_contacts = mongoContacts;
            }

            return { success: scraped > 0, data: result, task_id: taskId };
          }
        } catch { /* poll again */ }
      }
      logger.warn(`⏱️ Global API: task ${taskId} still running after ${maxWait / 1000}s`);
      return { success: false, error: `polling timeout after ${maxWait / 1000}s`, data: null };
    } catch (err: any) {
      logger.error(`❌ Global API failed: ${err.message}`);
      return { success: false, error: err.message, data: null };
    }
  }

  /**
   * Query jaimish_data.global_scraper_content for pages scraped in this task,
   * extract emails / phones / links from their full text content.
   */
  private async extractContactsFromMongo(taskId: string, companyName: string): Promise<ContactDetail[]> {
    const contacts: ContactDetail[] = [];
    try {
      const { MongoClient } = require('mongodb');
      const mongoUri = process.env.MONGODB_URI || env.MONGODB_URI;
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db('jaimish_data');

      // Find all docs scraped recently for this company (by keyword match)
      const keywordRx = new RegExp(
        companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).slice(0, 3).join('.*'),
        'i'
      );
      const docs = await db.collection('global_scraper_content')
        .find({ keyword: keywordRx }, { projection: { content: 1, metadata: 1, domain: 1, url: 1 } })
        .sort({ created_at: -1 })
        .limit(5)
        .toArray();

      await client.close();

      const seen = new Set<string>();
      for (const doc of docs) {
        // Flatten all text from the document
        const textParts: string[] = [];
        const c = doc.content || {};

        if (Array.isArray(c.paragraphs)) textParts.push(...c.paragraphs.filter(Boolean));
        if (Array.isArray(c.headings)) textParts.push(...c.headings.filter(Boolean));
        if (Array.isArray(c.lists)) textParts.push(...(c.lists.flat ? c.lists.flat() : c.lists).filter(Boolean));
        if (doc.metadata?.description) textParts.push(doc.metadata.description);
        if (doc.metadata?.keywords) textParts.push(doc.metadata.keywords);

        // Also search links for mailto: and tel:
        if (Array.isArray(c.links)) {
          for (const link of c.links) {
            const href = typeof link === 'string' ? link : link?.href || '';
            if (href.startsWith('mailto:')) {
              const email = href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
              if (email && !seen.has(email) && this.isRealEmail(email)) {
                seen.add(email);
                contacts.push({ name: null, title: null, email, phone: null, linkedin: null, website: null, address: null, source: 'global_api' });
              }
            }
            if (href.startsWith('tel:')) {
              const phone = href.replace('tel:', '').trim();
              if (phone && phone.length >= 7) {
                contacts.push({ name: null, title: null, email: null, phone, linkedin: null, website: null, address: null, source: 'global_api' });
              }
            }
          }
        }

        const fullText = textParts.join(' ');
        if (!fullText.trim()) continue;

        // Extract emails
        const emails = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        for (const e of emails) {
          const email = e.toLowerCase();
          if (!seen.has(email) && this.isRealEmail(email)) {
            seen.add(email);
            contacts.push({ name: null, title: null, email, phone: null, linkedin: null, website: null, address: null, source: 'global_api' });
          }
        }

        // Extract phones
        const phones = fullText.match(/\+?\d[\d\s\-().]{7,15}\d/g) || [];
        for (const ph of phones) {
          const digits = ph.replace(/\D/g, '');
          if (digits.length >= 7 && digits.length <= 15) {
            contacts.push({ name: null, title: null, email: null, phone: ph.replace(/\s+/g, ''), linkedin: null, website: null, address: null, source: 'global_api' });
          }
        }

        // Website from domain
        if (doc.domain && !contacts.find(c2 => c2.website)) {
          const website = `https://www.${doc.domain}`;
          contacts.push({ name: null, title: null, email: null, phone: null, linkedin: null, website, address: null, source: 'global_api' });
        }
      }
    } catch (e: any) {
      logger.warn(`⚠️ MongoDB contact extraction failed: ${e.message}`);
    }
    return contacts;
  }

  /**
   * Apollo FREE — uses only zero-credit endpoints:
   *  1. organizations/search  → domain, phone, LinkedIn (free)
   *  2. mixed_people/api_search → name, title, LinkedIn (free — emails stay hidden)
   * NO people/match (that costs credits).
   */
  private async callApolloFreeAPI(companyName: string, knownDomain?: string | null): Promise<any> {
    if (!env.APOLLO_API_KEY) return { success: false, error: 'No API key', contacts: [], domain: null };
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': env.APOLLO_API_KEY };
    const contacts: any[] = [];
    let domain = knownDomain || null;

    try {
      // ── Org search (free) — gets domain + company phone ─────────────
      const orgResp = await axios.post(
        'https://api.apollo.io/v1/organizations/search',
        { q_organization_name: companyName, page: 1, per_page: 1 },
        { headers, timeout: 15000 },
      ).catch(() => null);

      const org = orgResp?.data?.organizations?.[0] || orgResp?.data?.accounts?.[0] || null;
      if (org) {
        domain = org.primary_domain || domain;
        if (org.phone || org.linkedin_url || domain) {
          contacts.push({
            name: org.name || null, title: 'Company',
            email: null, phone: org.phone || null,
            linkedin: org.linkedin_url || null,
            website: domain ? `https://${domain}` : null,
            address: [org.city, org.state, org.country].filter(Boolean).join(', ') || null,
            source: 'apollo_org',
          });
        }
      }

      // ── People search (free) — gets name + title + LinkedIn ─────────
      const searchDomain = domain || null;
      const peopleQuery: any = searchDomain
        ? { organization_domains: [searchDomain], page: 1, per_page: 5,
            person_titles: ['purchase', 'procurement', 'import', 'director', 'manager', 'ceo', 'owner'] }
        : { q_organization_name: companyName, page: 1, per_page: 3 };

      const peopleResp = await axios.post(
        'https://api.apollo.io/api/v1/mixed_people/api_search',
        peopleQuery,
        { headers, timeout: 15000 },
      ).catch(() => null);

      const people = peopleResp?.data?.people || [];
      for (const p of people.slice(0, 5)) {
        const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
        if (!name && !p.linkedin_url) continue;

        // Validate the person is actually from the searched domain.
        // Apollo falls back to returning procurement/import people from random companies
        // when the searched domain isn't in its DB — discard those cross-company results.
        // Rule: if we searched by domain, ONLY keep people whose org domain matches.
        //       null org domain means Apollo didn't associate them with our domain → discard.
        const personDomain = p.organization?.primary_domain || null;
        if (searchDomain && personDomain !== searchDomain) {
          logger.debug(`Apollo: skipping ${name || 'unnamed'} (orgDomain=${personDomain}) — not from ${searchDomain}`);
          continue;
        }

        contacts.push({
          name,
          title: p.title || null,
          email: null,          // hidden — DO NOT reveal (costs credits)
          phone: null,          // only available via match (costs credits)
          linkedin: p.linkedin_url || null,
          website: null, address: null,
          source: 'apollo_people',
        });
        if (!domain && p.organization?.primary_domain) domain = p.organization.primary_domain;
      }

      const namedContacts = contacts.filter(c => c.name && c.name !== org?.name).length;
      logger.info(`✅ Apollo free: domain=${domain}, org_phone=${org?.phone || 'none'}, people=${namedContacts} names found`);
      return { success: true, contacts, count: contacts.length, domain };
    } catch (err: any) {
      logger.error(`❌ Apollo free failed: ${err.message}`);
      return { success: false, error: err.message, contacts: [], domain };
    }
  }

  private async callApolloAPI(companyName: string, knownDomain?: string | null): Promise<any> {
    if (!env.APOLLO_API_KEY) return { success: false, error: 'No API key', contacts: [], domain: null };
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': env.APOLLO_API_KEY };
    const contacts: any[] = [];
    let domain = knownDomain || null;

    try {
      // ── Step A: Org search to get domain + phone ──
      const orgResp = await axios.post(
        'https://api.apollo.io/v1/organizations/search',
        { q_organization_name: companyName, page: 1, per_page: 1 },
        { headers, timeout: 20000 },
      );
      const org = orgResp.data.organizations?.[0] || orgResp.data.accounts?.[0] || null;
      if (org) {
        domain = org.primary_domain || domain;
        if (org.phone || org.linkedin_url) {
          contacts.push({
            name: org.name || null, title: 'Company',
            email: null, phone: org.phone || null,
            linkedin: org.linkedin_url || null,
            website: domain ? `https://${domain}` : null,
            address: [org.city, org.state, org.country].filter(Boolean).join(', ') || null,
            source: 'apollo',
          });
        }
      }

      // ── Step B: People search (paid plan — finds named contacts) ──
      // ALWAYS prefer org-found domain over AI-guessed domain hint
      if (org?.primary_domain) domain = org.primary_domain;
      const searchDomain = domain || null;
      if (searchDomain) {
        const peopleResp = await axios.post(
          'https://api.apollo.io/api/v1/mixed_people/api_search',
          {
            organization_domains: [searchDomain],
            page: 1, per_page: 5,
            // Target purchase/import decision-makers
            person_titles: ['purchase', 'procurement', 'import', 'supply chain', 'director', 'manager', 'ceo', 'owner', 'head of'],
          },
          { headers, timeout: 20000 },
        );
        const people = peopleResp.data?.people || [];
        logger.info(`✅ Apollo people search: ${people.length} people at ${searchDomain}`);

        // ── Step C: Reveal emails for top 3 people ──
        const toReveal = people.slice(0, 3).filter((p: any) => p.id);
        for (const person of toReveal) {
          try {
            const matchResp = await axios.post(
              'https://api.apollo.io/api/v1/people/match',
              { id: person.id, reveal_personal_emails: false },
              { headers, timeout: 15000 },
            );
            const p = matchResp.data?.person || {};
            if (p.email || p.linkedin_url || p.phone_numbers?.length) {
              contacts.push({
                name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
                title: p.title || null,
                email: p.email || null,
                phone: p.phone_numbers?.[0]?.sanitized_number || null,
                linkedin: p.linkedin_url || null,
                website: null, address: null,
                source: 'apollo',
              });
            }
          } catch { /* skip failed reveal */ }
          await this.sleep(300); // avoid rate limit
        }
      } else {
        // No domain — try name-based people search
        const peopleByName = await axios.post(
          'https://api.apollo.io/api/v1/mixed_people/api_search',
          { q_organization_name: companyName, page: 1, per_page: 3 },
          { headers, timeout: 20000 },
        ).catch(() => null);
        const people = peopleByName?.data?.people || [];
        for (const person of people.slice(0, 2)) {
          if (!person.id) continue;
          try {
            const matchResp = await axios.post(
              'https://api.apollo.io/api/v1/people/match',
              { id: person.id, reveal_personal_emails: false },
              { headers, timeout: 15000 },
            );
            const p = matchResp.data?.person || {};
            if (p.email || p.linkedin_url) {
              contacts.push({
                name: p.name || null, title: p.title || null,
                email: p.email || null, phone: p.phone_numbers?.[0]?.sanitized_number || null,
                linkedin: p.linkedin_url || null,
                website: null, address: null, source: 'apollo',
              });
              if (!domain && p.organization?.primary_domain) domain = p.organization.primary_domain;
            }
          } catch { /* skip */ }
          await this.sleep(300);
        }
      }

      const emailCount = contacts.filter(c => c.email).length;
      logger.info(`✅ Apollo total: ${contacts.length} contacts, ${emailCount} emails, domain=${domain}`);
      return { success: true, contacts, count: contacts.length, domain };
    } catch (err: any) {
      logger.error(`❌ Apollo failed: ${err.message}`);
      return { success: false, error: err.message, contacts: [], domain };
    }
  }

  private isValidDomain(domain: string): boolean {
    if (!domain || domain.length > 80) return false;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;
    if (this.SKIP_DOMAINS.some(s => domain.includes(s))) return false;
    const name = domain.split('.')[0];
    if (name.length > 40) return false;
    return true;
  }

  private async callHunterAPI(domain: string | null): Promise<any> {
    if (!env.HUNTER_API_KEY) return { success: false, error: 'No API key', emails: [] };
    if (!domain) return { success: false, error: 'No domain', emails: [] };
    if (!this.isValidDomain(domain)) {
      logger.warn(`⚠️ Hunter: skipping invalid/suspicious domain "${domain}"`);
      return { success: false, error: `Invalid domain: ${domain}`, emails: [] };
    }
    // Retry up to 3 times — handles 429 rate limit with backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.get('https://api.hunter.io/v2/domain-search', {
          params: { domain, api_key: env.HUNTER_API_KEY, limit: 10 },
          timeout: 45000,
        });
        const emails = response.data.data?.emails || [];
        logger.info(`✅ Hunter: ${emails.length} emails for ${domain}`);
        return { success: true, emails, count: emails.length };
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 429) {
          // Rate limited — wait and retry
          const wait = attempt * 15000; // 15s, 30s, 45s
          logger.warn(`⚠️ Hunter: 429 rate limit — waiting ${wait / 1000}s (attempt ${attempt}/3)`);
          await this.sleep(wait);
          continue;
        }
        logger.error(`❌ Hunter failed: ${err.message}`);
        return { success: false, error: err.message, emails: [] };
      }
    }
    return { success: false, error: 'Hunter: rate limit exceeded after 3 retries', emails: [] };
  }

  private snovToken: string | null = null;
  private snovTokenExpiry = 0;

  private async getSnovToken(): Promise<string | null> {
    if (!env.SNOV_CLIENT_ID || !env.SNOV_CLIENT_SECRET) return null;
    if (this.snovToken && Date.now() < this.snovTokenExpiry) return this.snovToken;
    try {
      const resp = await axios.post('https://api.snov.io/v1/oauth/access_token', {
        grant_type: 'client_credentials',
        client_id: env.SNOV_CLIENT_ID,
        client_secret: env.SNOV_CLIENT_SECRET,
      }, { timeout: 10000 });
      this.snovToken = resp.data.access_token;
      this.snovTokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
      return this.snovToken;
    } catch {
      return null;
    }
  }

  private async callSnovAPI(domain: string | null): Promise<any> {
    if (!env.SNOV_CLIENT_ID || !env.SNOV_CLIENT_SECRET) return { success: false, error: 'No credentials', emails: [] };
    if (!domain) return { success: false, error: 'No domain', emails: [] };
    if (!this.isValidDomain(domain)) {
      logger.warn(`⚠️ Snov: skipping invalid domain "${domain}"`);
      return { success: false, error: `Invalid domain: ${domain}`, emails: [] };
    }
    const token = await this.getSnovToken();
    if (!token) return { success: false, error: 'Token fetch failed', emails: [] };
    try {
      // v2 endpoint works with paid plan — returns array directly in data[]
      const response = await axios.get(
        'https://api.snov.io/v2/domain-emails-with-info',
        {
          params: { domain, type: 'all', limit: 20, access_token: token },
          timeout: 20000,
        }
      );
      // v2 response: { success: true, meta: {...}, data: [{email, type, status}, ...] }
      const rawEmails: any[] = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.emails || []);

      // STRICT: only keep emails whose domain matches the searched domain
      const emails = rawEmails
        .filter((e: any) => {
          if (!e.email || e.status === 'invalid') return false;
          const emailDomain = e.email.split('@')[1]?.toLowerCase();
          return emailDomain === domain.toLowerCase(); // reject cross-domain contamination
        })
        .map((e: any) => ({
          email: e.email,
          firstName: e.firstName || e.first_name || '',
          lastName: e.lastName || e.last_name || '',
          position: e.position || e.title || '',
        }));

      logger.info(`✅ Snov v2: ${emails.length} emails for ${domain} (${rawEmails.length} raw)`);
      return { success: true, emails, count: emails.length };
    } catch (err: any) {
      const status = (err as any).response?.status;
      const msg = status === 403 ? 'Snov: plan does not support domain search'
        : status === 404 ? 'Snov: domain not found'
        : err.message;
      logger.warn(`⚠️ Snov: ${msg}`);
      return { success: false, error: msg, emails: [] };
    }
  }

  private async callZeroBounceAPI(emails: string[]): Promise<any> {
    if (!env.ZEROBOUNCE_API_KEY) {
      logger.warn('ZeroBounce API key not configured — skipping email verification');
      return { success: true, skipped: true, reason: 'ZEROBOUNCE_API_KEY not configured', verified: emails.map(e => ({ email: e, status: 'unverified', valid: false })), count: emails.length, valid_count: 0 };
    }
    if (emails.length === 0) return { success: true, verified: [], count: 0, valid_count: 0 };

    const verified = [];
    for (const email of emails.slice(0, 10)) {
      try {
        const response = await axios.get('https://api.zerobounce.net/v2/validate', {
          params: { api_key: env.ZEROBOUNCE_API_KEY, email }, timeout: 5000,
        });
        verified.push({ email, status: response.data.status, sub_status: response.data.sub_status, valid: response.data.status === 'valid' });
        logger.info(`✅ ZeroBounce: ${email} → ${response.data.status}`);
      } catch (err: any) {
        verified.push({ email, status: 'error', valid: false, error: err.message });
      }
      await this.sleep(500);
    }
    return { success: true, verified, count: verified.length, valid_count: verified.filter(e => e.valid).length };
  }
}
