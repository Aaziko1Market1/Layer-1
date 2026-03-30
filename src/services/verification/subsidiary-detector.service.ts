import axios from 'axios';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import type { SubsidiaryInfo, SubsidiaryDetectionMethod } from '../../types';

/**
 * Known Fortune 500 / large multinational brand keywords.
 * Used to detect if a company name is a subsidiary of a major parent.
 */
const FORTUNE500_KEYWORDS = [
  'walmart', 'amazon', 'apple', 'unitedhealth', 'berkshire', 'mckesson',
  'cvs health', 'exxon', 'alphabet', 'google', 'microsoft', 'costco', 'cigna',
  'chevron', 'cardinal health', 'walgreens', 'jpmorgan', 'verizon',
  'bank of america', 'comcast', 'marathon', 'fannie mae', 'freddie mac',
  'samsung', 'toyota', 'volkswagen', 'daimler', 'bmw', 'mercedes', 'honda',
  'shell', 'totalenergies', 'total energies', 'bp ', 'saudi aramco', 'sinopec',
  'petrochina', 'rosneft', 'gazprom',
  'dow ', 'dow chemical', 'dow inc', 'basf', 'bayer', 'siemens', 'bosch', 'thyssen',
  'unilever', 'nestle', 'kraft heinz', 'mondelez',
  'procter & gamble', 'p&g', 'johnson & johnson', 'abbott', 'pfizer',
  'novartis', 'roche', 'sanofi', 'astrazeneca', 'glaxosmithkline', 'gsk',
  '3m', 'dupont', 'honeywell', 'caterpillar', 'deere', 'cargill', 'archer daniels',
  'lvmh', 'inditex', 'h&m', 'nike', 'adidas', 'puma',
  'reckitt', 'henkel', 'danone', 'ab inbev', 'diageo', 'pernod',
  'tata ', 'reliance industries', 'infosys', 'wipro', 'hdfc',
  'alibaba', 'tencent', 'jd.com', 'xiaomi', 'huawei',
];

/**
 * Regex patterns to detect subsidiary relationship phrases in text.
 * Capture group 1 = parent company name.
 */
const SUBSIDIARY_PHRASES = [
  /a\s+subsidiary\s+of\s+([\w\s&.,'-]{3,60}?)(?:\.|,|\n|$)/i,
  /part\s+of\s+the\s+([\w\s&.,'-]{3,60}?)\s+group/i,
  /a\s+division\s+of\s+([\w\s&.,'-]{3,60}?)(?:\.|,|\n|$)/i,
  /wholly\s+owned\s+(?:subsidiary\s+)?of\s+([\w\s&.,'-]{3,60}?)(?:\.|,|\n|$)/i,
  /owned\s+by\s+([\w\s&.,'-]{3,60}?)(?:\.|,|\n|$)/i,
  /member\s+of\s+(?:the\s+)?([\w\s&.,'-]{3,60}?)\s+group/i,
  /an?\s+([\w\s&.,'-]{3,30}?)\s+group\s+company/i,
];

/**
 * Subsidiary Detector — Stage 2 Task 4
 *
 * Detection order:
 * 1. Company name pattern match against Fortune 500 keywords (fast, free)
 * 2. Website text scan for subsidiary phrases (no extra I/O)
 * 3. Brave Search fallback (API call, only when no match found)
 */
export class SubsidiaryDetectorService {
  /**
   * Detect if a company is a subsidiary.
   * @param companyName  Raw company name from trade data
   * @param websiteText  Combined scraped page text (nullable)
   */
  async detect(
    companyName: string,
    websiteText: string | null,
  ): Promise<SubsidiaryInfo> {
    // 1. Name pattern (no I/O, instant)
    const nameResult = this.detectByNamePattern(companyName);
    if (nameResult.isSubsidiary) return nameResult;

    // 2. Website content scan
    if (websiteText) {
      const contentResult = this.detectByContent(websiteText);
      if (contentResult.isSubsidiary) return contentResult;
    }

    // 3. Brave Search (only if API key available)
    if (env.BRAVE_SEARCH_API_KEY) {
      const searchResult = await this.detectBySearch(companyName);
      if (searchResult.isSubsidiary) return searchResult;
    }

    return this.notSubsidiary();
  }

  detectByNamePattern(companyName: string): SubsidiaryInfo {
    const lower = companyName.toLowerCase();
    for (const keyword of FORTUNE500_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        return {
          isSubsidiary: true,
          parentCompany: this.toTitleCase(keyword.trim()),
          parentIsFortune500: true,
          detectionMethod: 'name_pattern',
          confidence: 0.85,
        };
      }
    }
    return this.notSubsidiary();
  }

  detectByContent(text: string): SubsidiaryInfo {
    for (const regex of SUBSIDIARY_PHRASES) {
      const match = text.match(regex);
      if (match?.[1]) {
        const parentCompany = match[1].trim().replace(/\s+/g, ' ');
        const parentIsFortune500 = FORTUNE500_KEYWORDS.some((kw) =>
          parentCompany.toLowerCase().includes(kw.toLowerCase())
        );
        return {
          isSubsidiary: true,
          parentCompany,
          parentIsFortune500,
          detectionMethod: 'website_content',
          confidence: 0.9,
        };
      }
    }
    return this.notSubsidiary();
  }

  private async detectBySearch(companyName: string): Promise<SubsidiaryInfo> {
    try {
      const query = `"${companyName}" parent company subsidiary`;
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query, count: 3 },
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY,
        },
        timeout: 5000,
      });

      const snippets: string = (response.data.web?.results || [])
        .map((r: any) => `${r.title} ${r.description || ''}`)
        .join(' ');

      const result = this.detectByContent(snippets);
      if (result.isSubsidiary) {
        return { ...result, detectionMethod: 'search_api' };
      }
    } catch (err: any) {
      logger.debug('Subsidiary search failed', { companyName, error: err.message });
    }
    return this.notSubsidiary();
  }

  private notSubsidiary(): SubsidiaryInfo {
    return {
      isSubsidiary: false,
      parentCompany: null,
      parentIsFortune500: false,
      detectionMethod: 'none',
      confidence: 0,
    };
  }

  private toTitleCase(str: string): string {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
