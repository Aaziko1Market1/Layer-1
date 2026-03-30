import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../config/logger';
import { aiGenerate } from '../ai/router';
import type { ExtractedData } from '../../types';

const PAGE_TIMEOUT = 10000; // 10s per page per spec
const MAX_PAGES = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; BuyerIntelligenceBot/1.0)';

/**
 * Website Data Extractor — Stage 2 Task 3
 *
 * Only runs on websites with trust score >= 50.
 * Scrapes up to 3 pages (homepage, about, contact/team) using cheerio.
 * Sends combined page text to Qwen3-8B for structured JSON extraction.
 * Returns ExtractedData with team members, products, emails, locations, news.
 */
export class WebsiteExtractorService {
  /**
   * Extract structured data from a trusted website.
   * Returns null if trust_score < 50. Returns empty ExtractedData if scraping fails.
   */
  async extract(domain: string, trustScore: number): Promise<ExtractedData | null> {
    if (trustScore < 50) {
      logger.info('Skipping extraction — trust score below threshold', { domain, trustScore });
      return null;
    }

    const baseUrl = `https://${domain}`;
    logger.info('Starting website extraction', { domain, trustScore });

    try {
      // Scrape up to MAX_PAGES pages
      const pagePaths = ['', '/about', '/about-us', '/team', '/contact', '/contact-us'];
      const rawTexts: string[] = [];

      for (const path of pagePaths) {
        if (rawTexts.length >= MAX_PAGES) break;
        const text = await this.scrapePage(`${baseUrl}${path}`);
        if (text) rawTexts.push(text);
      }

      if (rawTexts.length === 0) {
        logger.warn('No pages successfully scraped', { domain });
        return this.emptyData();
      }

      // Combine and truncate to keep prompt manageable
      const combinedText = rawTexts.join('\n\n---\n\n').slice(0, 4000);

      const extracted = await this.aiExtract(combinedText);

      logger.info('Website extraction complete', {
        domain,
        teamMembers: extracted.teamMembers.length,
        emails: extracted.contactEmails.length,
        products: extracted.productsList.length,
        locations: extracted.officeLocations.length,
      });

      return extracted;
    } catch (err: any) {
      logger.error('Website extraction failed', { domain, error: err.message });
      return this.emptyData();
    }
  }

  /**
   * Scrape a single page, strip noise, return clean body text.
   */
  async scrapePage(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: PAGE_TIMEOUT,
        headers: { 'User-Agent': USER_AGENT },
        maxRedirects: 3,
        validateStatus: (s) => s < 400,
      });

      const $ = cheerio.load(response.data as string);
      $('script, style, nav, footer, header, iframe, noscript, svg').remove();

      const text = $('body').text().replace(/\s+/g, ' ').trim();
      return text.length > 50 ? text.slice(0, 2000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Use Qwen3-8B to extract structured data from raw page text.
   */
  async aiExtract(pageText: string): Promise<ExtractedData> {
    const prompt = `Extract structured company information from this website text. Return ONLY valid JSON, no explanation.

Website text:
${pageText}

Return this exact JSON structure:
{
  "companyDescription": "<1-2 sentence company description, or empty string if not found>",
  "productsList": ["<product or service name>"],
  "contactEmails": ["<email@domain.com>"],
  "contactPhones": ["+1-555-123-4567"],
  "officeLocations": ["<City, Country>"],
  "teamMembers": [{"name": "<Full Name>", "title": "<Job Title>"}],
  "recentNews": ["<news or press release headline>"]
}

Rules:
- teamMembers: only real people with both name AND title, max 10
- contactEmails: only valid emails, not placeholders like example@test.com
- productsList: max 15 items, only actual product/service names
- recentNews: max 5 items
- officeLocations: city + country format, max 5
- If a field has no data return empty array or empty string`;

    try {
      const response = await aiGenerate({
        prompt,
        tier: 'standard',
        temperature: 0.1,
        maxTokens: 1024,
      });

      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) return this.emptyData();

      const parsed = JSON.parse(match[0]);

      return {
        companyDescription: typeof parsed.companyDescription === 'string' ? parsed.companyDescription : '',
        productsList: Array.isArray(parsed.productsList) ? parsed.productsList.slice(0, 15) : [],
        contactEmails: Array.isArray(parsed.contactEmails)
          ? parsed.contactEmails.filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10)
          : [],
        contactPhones: Array.isArray(parsed.contactPhones) ? parsed.contactPhones.slice(0, 5) : [],
        officeLocations: Array.isArray(parsed.officeLocations) ? parsed.officeLocations.slice(0, 5) : [],
        teamMembers: Array.isArray(parsed.teamMembers)
          ? parsed.teamMembers
              .filter((m: any) => m && typeof m.name === 'string' && typeof m.title === 'string')
              .slice(0, 10)
          : [],
        recentNews: Array.isArray(parsed.recentNews) ? parsed.recentNews.slice(0, 5) : [],
        extractedAt: new Date(),
      };
    } catch (err: any) {
      logger.warn('AI extraction parse failed', { error: err.message });
      return this.emptyData();
    }
  }

  private emptyData(): ExtractedData {
    return {
      companyDescription: '',
      productsList: [],
      contactEmails: [],
      contactPhones: [],
      officeLocations: [],
      teamMembers: [],
      recentNews: [],
      extractedAt: new Date(),
    };
  }
}
