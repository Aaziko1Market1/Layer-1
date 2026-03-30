import { BaseAgent } from './base.agent';
import { WebsiteScraperService } from '../scraping/website-scraper.service';
import { classifyBuyer } from '../ai/router';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import axios from 'axios';
import type { BuyerProfile } from '../../types';

export interface CompanyResearch {
  business_model: string;
  category_summary: string;
  products: string[];
  industry: string;
  size_estimate: string;
  india_fit_score: number;
  likely_buying_pattern: string;
  source_urls: string[];
}

/**
 * Agent 1: Company Research Agent
 * Researches company using Brave Search, website scraping, and AI analysis
 */
export class CompanyResearchAgent extends BaseAgent {
  private scraper: WebsiteScraperService;

  constructor() {
    super('CompanyResearchAgent');
    this.scraper = new WebsiteScraperService();
  }

  /**
   * Research company and compute India fit score
   */
  async research(profile: BuyerProfile): Promise<CompanyResearch> {
    const start = Date.now();
    this.logStart(profile.companyName, 'company research');

    try {
      // Step 1: Google Scraper API (NO TIMEOUT - let it take as long as needed)
      const googleResults = await this.safeExecute(
        () => this.googleScraperSearch(profile.companyName),
        'Google Scraper',
        []
      );

      // Step 1.5: Send Google results to Global API (NO TIMEOUT)
      if (googleResults.length > 0) {
        await this.safeExecute(
          () => this.sendToGlobalAPI(profile, googleResults),
          'Global API',
          null
        );
      }

      // Step 2: Website Scraping (10s timeout)
      let scrapedData = null;
      if (profile.verifiedWebsite) {
        scrapedData = await this.safeExecute(
          () => this.withTimeout(() => this.scraper.scrapeWebsite(profile.verifiedWebsite!), 10000, 'Website Scraping'),
          'Website Scraping',
          null
        );
      }

      // Step 3: AI Analysis (15s timeout)
      const aiAnalysis = await this.safeExecute(
        () =>
          this.withTimeout(
            () => this.analyzeIndiaFit(profile, googleResults, scrapedData),
            15000,
            'AI Analysis'
          ),
        'AI Analysis',
        {
          india_fit_score: 50,
          likely_buying_pattern: 'Unknown',
          business_model: 'Unknown',
        }
      );

      // Step 4: Assemble research object
      const research: CompanyResearch = {
        business_model: scrapedData?.about || aiAnalysis.business_model || 'No data available',
        category_summary: profile.industry || 'Unknown',
        products: [
          ...new Set([
            ...(scrapedData?.products || []),
            ...profile.products.slice(0, 10),
          ]),
        ].slice(0, 20),
        industry: profile.industry || 'Unknown',
        size_estimate: scrapedData?.teamSize || this.estimateSizeFromTrade(profile),
        india_fit_score: aiAnalysis.india_fit_score,
        likely_buying_pattern: aiAnalysis.likely_buying_pattern,
        source_urls: [
          ...(profile.verifiedWebsite ? [profile.verifiedWebsite] : []),
          ...googleResults.map((r) => r.url),
        ].slice(0, 5),
      };

      this.logComplete(profile.companyName, 'company research', Date.now() - start);
      return research;
    } catch (err: any) {
      this.logError(profile.companyName, 'company research', err.message);

      // Return minimal research object
      return {
        business_model: 'Research failed',
        category_summary: profile.industry || 'Unknown',
        products: profile.products.slice(0, 10),
        industry: profile.industry || 'Unknown',
        size_estimate: this.estimateSizeFromTrade(profile),
        india_fit_score: 50,
        likely_buying_pattern: 'Unknown',
        source_urls: profile.verifiedWebsite ? [profile.verifiedWebsite] : [],
      };
    }
  }

  /**
   * Search using Google Scraper API
   */
  private async googleScraperSearch(
    companyName: string
  ): Promise<Array<{ title: string; url: string; description: string }>> {
    try {
      logger.info(`Calling Google Scraper API for: ${companyName}`);
      
      const response = await axios.post(
        'http://aaziko.google.43.249.231.93.sslip.io/api/search',
        { company_name: companyName },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
        }
      );

      const results: Array<{ title: string; url: string; description: string }> = [];
      const data = response.data || {};
      const items = data.results || data.items || [];
      items.forEach((item: any) => {
        results.push({
          title: item.title || item.name || '',
          url: item.url || item.link || '',
          description: item.snippet || item.description || '',
        });
      });
      // Prepend business_info website if available
      const biz = data.business_info || {};
      if (biz.website) results.unshift({ title: companyName, url: biz.website, description: biz.description || '' });

      logger.info(`Google Scraper found ${results.length} results for ${companyName}`);
      return results.slice(0, 5);
    } catch (err: any) {
      // Log error but don't fail - this is optional enrichment
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        logger.warn(`Google Scraper timeout for ${companyName} - continuing without it`);
      } else {
        this.logError(companyName, 'Google Scraper', err.message);
      }
      return [];
    }
  }

  /**
   * Send Google Scraper results to Global API
   */
  private async sendToGlobalAPI(
    profile: BuyerProfile,
    googleResults: Array<{ title: string; url: string; description: string }>
  ): Promise<void> {
    try {
      logger.info(`Sending data to Global API for: ${profile.companyName}`);
      
      // Only send company name + country + google results
      const payload = {
        company_name: profile.companyName,
        country: profile.country,
        google_results: googleResults,
      };

      const response = await axios.post(
        'https://aaziko.global.202.47.115.6.sslip.io/api/research',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      logger.info(`Global API response for ${profile.companyName}:`, {
        status: response.status,
        data: response.data,
      });
    } catch (err: any) {
      // Log error but don't fail - this is optional enrichment
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        logger.warn(`Global API timeout for ${profile.companyName} - continuing without it`);
      } else if (err.code === 'ECONNREFUSED' || err.response?.status === 502) {
        logger.warn(`Global API unavailable for ${profile.companyName} - continuing without it`);
      } else {
        this.logError(profile.companyName, 'Global API', err.message);
      }
    }
  }

  /**
   * Analyze India fit using AI
   */
  private async analyzeIndiaFit(
    profile: BuyerProfile,
    googleResults: Array<{ title: string; description: string }>,
    scrapedData: any
  ): Promise<{
    india_fit_score: number;
    likely_buying_pattern: string;
    business_model: string;
  }> {
    try {
      const prompt = `Analyze this company's fit with Indian suppliers.

Company: ${profile.companyName}
Country: ${profile.country}
Industry: ${profile.industry || 'Unknown'}
Products: ${profile.products.slice(0, 5).join(', ')}
Trade Stats: ${profile.tradeStats.totalShipments} shipments, $${profile.tradeStats.totalValue.toFixed(0)} total value
Buying Frequency: ${profile.tradeStats.frequency}

${googleResults.length > 0 ? `Google Search Results:\n${googleResults.map((r) => `- ${r.title}: ${r.description}`).join('\n')}` : ''}

${scrapedData?.about ? `Company Description:\n${scrapedData.about}` : ''}

Provide a JSON response with:
{
  "india_fit_score": <0-100, how well this company fits with Indian suppliers>,
  "likely_buying_pattern": "<weekly/monthly/quarterly/sporadic>",
  "business_model": "<brief description of business model>",
  "reasoning": "<why this score>"
}

Consider:
- India is strong in: textiles, chemicals, pharmaceuticals, machinery, electronics, automotive parts
- Higher scores for: regular buyers, high volume, industries where India is competitive
- Lower scores for: specialized European products, luxury goods, highly regulated industries`;

      const response = await classifyBuyer(
        profile.companyName,
        profile.products,
        profile.country,
        profile.tradeStats.totalShipments
      );

      // Try to parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          let jsonStr = jsonMatch[0];
          
          // Fix common AI JSON errors
          // 1. Fix unquoted NOT_FOUND, UNKNOWN, NULL values
          jsonStr = jsonStr.replace(/:\s*(NOT_FOUND|UNKNOWN|NULL|None|null)\s*([,}])/g, ': "$1"$2');
          
          // 2. Fix trailing commas
          jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          
          const parsed = JSON.parse(jsonStr);
          return {
            india_fit_score: Math.min(100, Math.max(0, parsed.india_fit_score || 50)),
            likely_buying_pattern: parsed.likely_buying_pattern || profile.tradeStats.frequency,
            business_model: parsed.business_model || 'Unknown',
          };
        } catch (parseError: any) {
          logger.warn('Failed to parse AI analysis JSON', {
            company: profile.companyName,
            error: parseError.message
          });
        }
      }

      // Fallback: compute score based on trade stats
      return {
        india_fit_score: this.computeFallbackFitScore(profile),
        likely_buying_pattern: profile.tradeStats.frequency,
        business_model: 'AI analysis unavailable',
      };
    } catch (err: any) {
      this.logError(profile.companyName, 'AI Analysis', err.message);
      return {
        india_fit_score: this.computeFallbackFitScore(profile),
        likely_buying_pattern: profile.tradeStats.frequency,
        business_model: 'AI analysis failed',
      };
    }
  }

  /**
   * Compute fallback fit score based on trade stats
   */
  private computeFallbackFitScore(profile: BuyerProfile): number {
    let score = 50; // Start neutral

    // Adjust based on trade volume
    if (profile.tradeStats.totalShipments >= 50) score += 15;
    else if (profile.tradeStats.totalShipments >= 20) score += 10;
    else if (profile.tradeStats.totalShipments >= 10) score += 5;

    // Adjust based on frequency
    if (profile.tradeStats.frequency === 'weekly') score += 10;
    else if (profile.tradeStats.frequency === 'monthly') score += 7;
    else if (profile.tradeStats.frequency === 'quarterly') score += 4;

    // Adjust based on industry (India-strong industries)
    const indiaStrongIndustries = [
      'textile',
      'chemical',
      'pharmaceutical',
      'machinery',
      'electronic',
      'automotive',
      'steel',
      'plastic',
      'leather',
      'jewelry',
    ];
    const industry = (profile.industry || '').toLowerCase();
    if (indiaStrongIndustries.some((i) => industry.includes(i))) {
      score += 15;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Estimate company size from trade stats
   */
  private estimateSizeFromTrade(profile: BuyerProfile): string {
    const shipments = profile.tradeStats.totalShipments;
    const value = profile.tradeStats.totalValue;

    if (shipments >= 100 || value >= 5_000_000) return '200-1000';
    if (shipments >= 50 || value >= 1_000_000) return '50-200';
    if (shipments >= 20 || value >= 500_000) return '10-50';
    if (shipments >= 10 || value >= 100_000) return '10-50';
    return '1-10';
  }
}

