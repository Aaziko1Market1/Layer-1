import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../config/logger';
import { aiGenerate } from '../ai/router';
import {
  calculateDomainAge,
  scoreDomainAge,
  normalizeText,
  calculateTokenOverlap,
} from './utils';
import type {
  WebsiteCandidate,
  TrustInput,
  TrustScore,
  DomainAgeCheck,
  SSLCheck,
  NameMatchCheck,
  CountryMatchCheck,
  IndustryMatchCheck,
  MultiSourceCheck,
  TrustBand,
} from '../../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const whois = require('whois-json');

/**
 * Website Trust Service
 * Calculates trust scores for candidate websites using 6 checks:
 * 1. Domain Age (0-15 points)
 * 2. SSL Certificate (0-10 points)
 * 3. Company Name Match (0-25 points) - MOST IMPORTANT
 * 4. Country/Address Match (0-15 points)
 * 5. Industry/Product Match (0-15 points)
 * 6. Multi-Source Confirmation (0-20 points) - STRONGEST SIGNAL
 */
export class WebsiteTrustService {
  private readonly WHOIS_TIMEOUT = 5000;
  private readonly SSL_TIMEOUT = 5000;
  private readonly SCRAPE_TIMEOUT = 10000;
  private readonly AI_TIMEOUT = 15000;

  /**
   * Main trust scoring function - orchestrates all 6 checks
   */
  async calculateTrustScore(
    candidate: WebsiteCandidate,
    input: TrustInput
  ): Promise<TrustScore> {
    logger.info('Calculating trust score', {
      domain: candidate.domain,
      companyName: input.companyName,
    });

    try {
      // Run all 6 checks in parallel for performance
      const [
        domainAge,
        ssl,
        nameMatch,
        countryMatch,
        industryMatch,
        multiSource,
      ] = await Promise.all([
        this.checkDomainAge(candidate.domain),
        this.checkSSL(candidate.domain),
        this.checkCompanyNameMatch(candidate.url, input.companyName),
        this.checkCountryMatch(candidate.url, input.country),
        this.checkIndustryMatch(candidate.url, input.hsCodes),
        this.checkMultiSource(candidate.domain, {
          apolloDomain: input.apolloDomain,
          hunterDomain: input.hunterDomain,
          tradeDataDomains: input.tradeDataDomains || [],
        }),
      ]);

      // Calculate total score
      const totalScore =
        domainAge.score +
        ssl.score +
        nameMatch.score +
        countryMatch.score +
        industryMatch.score +
        multiSource.score;

      const trustBand = this.classifyTrustBand(totalScore);

      logger.info('Trust score calculated', {
        domain: candidate.domain,
        totalScore,
        trustBand,
        breakdown: {
          domainAge: domainAge.score,
          ssl: ssl.score,
          nameMatch: nameMatch.score,
          countryMatch: countryMatch.score,
          industryMatch: industryMatch.score,
          multiSource: multiSource.score,
        },
      });

      return {
        totalScore,
        trustBand,
        checks: {
          domainAge,
          ssl,
          nameMatch,
          countryMatch,
          industryMatch,
          multiSource,
        },
        calculatedAt: new Date(),
      };
    } catch (err: any) {
      logger.error('Trust score calculation failed', {
        domain: candidate.domain,
        error: err.message,
      });

      // Return worst-case score on catastrophic failure
      return this.getWorstCaseScore();
    }
  }

  /**
   * Check 1: Domain Age (0-15 points)
   * Uses WHOIS to check domain registration date
   * >5 years = 15 points, 2-5 years = 10, 1-2 years = 5, <1 year = 0
   * WHOIS failure = 5 points (neutral, not disqualifying)
   */
  async checkDomainAge(domain: string): Promise<DomainAgeCheck> {
    try {
      logger.debug('Checking domain age', { domain });

      const whoisData = await Promise.race([
        whois(domain),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('WHOIS timeout')), this.WHOIS_TIMEOUT)
        ),
      ]) as any;

      if (!whoisData || !whoisData.creationDate) {
        logger.warn('WHOIS returned no creation date', { domain });
        return {
          score: 5, // Neutral score
          registeredDate: null,
          ageYears: null,
          error: 'No creation date in WHOIS',
        };
      }

      const registeredDate = new Date(whoisData.creationDate);
      const ageYears = calculateDomainAge(registeredDate);
      const score = scoreDomainAge(ageYears);

      logger.debug('Domain age checked', { domain, ageYears, score });

      return {
        score,
        registeredDate,
        ageYears,
      };
    } catch (err: any) {
      logger.warn('Domain age check failed', { domain, error: err.message });
      return {
        score: 5, // Neutral score on failure
        registeredDate: null,
        ageYears: null,
        error: err.message,
      };
    }
  }

  /**
   * Check 2: SSL Certificate (0-10 points)
   * Tries HTTPS connection with 5-second timeout
   * HTTPS success = 10 points, failure = 0 points
   */
  async checkSSL(domain: string): Promise<SSLCheck> {
    try {
      logger.debug('Checking SSL', { domain });

      const url = `https://${domain}`;
      await axios.head(url, {
        timeout: this.SSL_TIMEOUT,
        validateStatus: (status) => status < 500, // Accept any non-server-error
      });

      logger.debug('SSL check passed', { domain });

      return {
        score: 10,
        hasHttps: true,
        certificateValid: true,
      };
    } catch (err: any) {
      logger.warn('SSL check failed', { domain, error: err.message });
      return {
        score: 0,
        hasHttps: false,
        certificateValid: false,
        error: err.message,
      };
    }
  }

  /**
   * Check 3: Company Name Match (0-25 points) - MOST IMPORTANT
   * Scrapes homepage and checks if company name appears
   * Exact match = 25 points, >60% token overlap = 15, no match = 0
   */
  async checkCompanyNameMatch(
    url: string,
    companyName: string
  ): Promise<NameMatchCheck> {
    try {
      logger.debug('Checking company name match', { url, companyName });

      // Scrape homepage
      const response = await axios.get(url, {
        timeout: this.SCRAPE_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AazikoBot/1.0; +https://aaziko.com)',
        },
      });

      const $ = cheerio.load(response.data);

      // Extract text from key elements
      const title = $('title').text();
      const metaDescription = $('meta[name="description"]').attr('content') || '';
      const bodyText = $('body').text().substring(0, 500);

      const extractedText = `${title} ${metaDescription} ${bodyText}`;

      // Calculate token overlap
      const overlap = calculateTokenOverlap(companyName, extractedText);

      let score = 0;
      let matchType: 'exact' | 'partial' | 'none' = 'none';

      if (overlap >= 0.9) {
        score = 25;
        matchType = 'exact';
      } else if (overlap >= 0.6) {
        score = 15;
        matchType = 'partial';
      }

      logger.debug('Company name match checked', {
        url,
        overlap,
        score,
        matchType,
      });

      return {
        score,
        matchType,
        tokenOverlap: overlap,
        extractedText: extractedText.substring(0, 200),
      };
    } catch (err: any) {
      logger.warn('Company name match check failed', { url, error: err.message });
      return {
        score: 0,
        matchType: 'none',
        tokenOverlap: 0,
        extractedText: '',
        error: err.message,
      };
    }
  }

  /**
   * Check 4: Country/Address Match (0-15 points)
   * Scrapes contact/about pages for country mentions
   * Exact match = 15 points, adjacent country = 8, no match = 0
   */
  async checkCountryMatch(
    url: string,
    country: string
  ): Promise<CountryMatchCheck> {
    try {
      logger.debug('Checking country match', { url, country });

      // Try to scrape contact and about pages
      const pagesToCheck = [
        url,
        `${url}/contact`,
        `${url}/about`,
        `${url}/contact-us`,
        `${url}/about-us`,
      ];

      let websiteCountry: string | null = null;
      let foundText = '';

      for (const pageUrl of pagesToCheck) {
        try {
          const response = await axios.get(pageUrl, {
            timeout: this.SCRAPE_TIMEOUT,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AazikoBot/1.0; +https://aaziko.com)',
            },
          });

          const $ = cheerio.load(response.data);
          const text = $('body').text();
          foundText += text + ' ';

          // Check if country appears in text
          if (normalizeText(text).includes(normalizeText(country))) {
            websiteCountry = country;
            break;
          }
        } catch {
          // Skip failed pages
          continue;
        }
      }

      let score = 0;
      let isAdjacent = false;

      if (websiteCountry === country) {
        score = 15;
      } else if (this.isAdjacentCountry(country, foundText)) {
        score = 8;
        isAdjacent = true;
      }

      logger.debug('Country match checked', {
        url,
        websiteCountry,
        dataCountry: country,
        score,
      });

      return {
        score,
        websiteCountry,
        dataCountry: country,
        isAdjacent,
      };
    } catch (err: any) {
      logger.warn('Country match check failed', { url, error: err.message });
      return {
        score: 0,
        websiteCountry: null,
        dataCountry: country,
        isAdjacent: false,
        error: err.message,
      };
    }
  }

  /**
   * Check 5: Industry/Product Match (0-15 points)
   * Uses Qwen3-8B AI to check if website matches buyer's industry
   * YES = 15 points, MAYBE = 8, NO = 0
   */
  async checkIndustryMatch(
    url: string,
    hsCodes: string[]
  ): Promise<IndustryMatchCheck> {
    try {
      logger.debug('Checking industry match', { url, hsCodes });

      // Scrape website description
      const response = await axios.get(url, {
        timeout: this.SCRAPE_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AazikoBot/1.0; +https://aaziko.com)',
        },
      });

      const $ = cheerio.load(response.data);
      const description = $('meta[name="description"]').attr('content') || '';
      const bodyText = $('body').text().substring(0, 500);
      const websiteText = `${description} ${bodyText}`;

      // Build AI prompt
      const hsCodeDescriptions = hsCodes.slice(0, 3).join(', ');
      const prompt = `Does this website description match a company that buys or sells products related to HS codes: ${hsCodeDescriptions}?\n\nWebsite text: ${websiteText}\n\nAnswer with only: YES, MAYBE, or NO`;

      // Query AI
      const aiResponse = await Promise.race([
        aiGenerate({
          prompt,
          tier: 'standard',
          maxTokens: 10,
          temperature: 0,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI timeout')), this.AI_TIMEOUT)
        ),
      ]) as any;

      const answer = aiResponse.content.trim().toUpperCase();
      let score = 0;
      let aiResponseType: 'YES' | 'MAYBE' | 'NO' | 'ERROR' = 'ERROR';

      if (answer.includes('YES')) {
        score = 15;
        aiResponseType = 'YES';
      } else if (answer.includes('MAYBE')) {
        score = 8;
        aiResponseType = 'MAYBE';
      } else if (answer.includes('NO')) {
        score = 0;
        aiResponseType = 'NO';
      }

      logger.debug('Industry match checked', {
        url,
        aiResponse: aiResponseType,
        score,
      });

      return {
        score,
        aiResponse: aiResponseType,
        matchDetail: answer,
      };
    } catch (err: any) {
      logger.warn('Industry match check failed (AI unavailable)', {
        url,
        error: err.message,
      });
      return {
        score: 0,
        aiResponse: 'ERROR',
        matchDetail: 'AI unavailable',
        error: err.message,
      };
    }
  }

  /**
   * Check 6: Multi-Source Confirmation (0-20 points) - STRONGEST SIGNAL
   * Checks if domain appears in multiple independent sources
   * Apollo = +7, Hunter = +7, Trade data = +6 (max 20 points)
   */
  async checkMultiSource(
    domain: string,
    sources: {
      apolloDomain?: string;
      hunterDomain?: string;
      tradeDataDomains: string[];
    }
  ): Promise<MultiSourceCheck> {
    logger.debug('Checking multi-source confirmation', { domain });

    let score = 0;
    const apollo = sources.apolloDomain === domain;
    const hunter = sources.hunterDomain === domain;
    const tradeData = sources.tradeDataDomains.includes(domain);

    if (apollo) score += 7;
    if (hunter) score += 7;
    if (tradeData) score += 6;

    const confirmationCount = [apollo, hunter, tradeData].filter(Boolean).length;

    logger.debug('Multi-source confirmation checked', {
      domain,
      apollo,
      hunter,
      tradeData,
      confirmationCount,
      score,
    });

    return {
      score,
      apollo,
      hunter,
      tradeData,
      confirmationCount,
    };
  }

  /**
   * Classify trust band based on total score
   * ≥70 = high, 50-69 = medium, 30-49 = low, <30 = rejected
   */
  classifyTrustBand(score: number): TrustBand {
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'rejected';
  }

  /**
   * Helper: Check if a country is adjacent to the target country
   * Simplified implementation - can be expanded with actual geography data
   */
  private isAdjacentCountry(targetCountry: string, text: string): boolean {
    // Simplified: check for common adjacent country patterns
    const adjacentMap: Record<string, string[]> = {
      'GERMANY': ['FRANCE', 'POLAND', 'NETHERLANDS', 'BELGIUM', 'AUSTRIA', 'SWITZERLAND'],
      'FRANCE': ['GERMANY', 'SPAIN', 'ITALY', 'BELGIUM', 'SWITZERLAND'],
      'INDIA': ['PAKISTAN', 'BANGLADESH', 'NEPAL', 'SRI LANKA', 'MYANMAR'],
      'CHINA': ['INDIA', 'RUSSIA', 'VIETNAM', 'NORTH KOREA', 'MONGOLIA'],
      // Add more as needed
    };

    const adjacent = adjacentMap[targetCountry.toUpperCase()] || [];
    const normalizedText = normalizeText(text);

    return adjacent.some(country =>
      normalizedText.includes(normalizeText(country))
    );
  }

  /**
   * Return worst-case score (all checks failed)
   */
  private getWorstCaseScore(): TrustScore {
    return {
      totalScore: 0,
      trustBand: 'rejected',
      checks: {
        domainAge: { score: 0, registeredDate: null, ageYears: null, error: 'Check failed' },
        ssl: { score: 0, hasHttps: false, certificateValid: false, error: 'Check failed' },
        nameMatch: { score: 0, matchType: 'none', tokenOverlap: 0, extractedText: '', error: 'Check failed' },
        countryMatch: { score: 0, websiteCountry: null, dataCountry: '', isAdjacent: false, error: 'Check failed' },
        industryMatch: { score: 0, aiResponse: 'ERROR', matchDetail: '', error: 'Check failed' },
        multiSource: { score: 0, apollo: false, hunter: false, tradeData: false, confirmationCount: 0 },
      },
      calculatedAt: new Date(),
    };
  }
}
