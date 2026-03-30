import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { EnrichmentResult } from '../../types';

const client = axios.create({
  baseURL: 'https://api.search.brave.com/res/v1',
  timeout: 15_000,
});

export async function braveSearchCompany(companyName: string, country?: string): Promise<EnrichmentResult> {
  if (!env.BRAVE_SEARCH_API_KEY) {
    return { source: 'brave', data: {}, fetchedAt: new Date(), status: 'error', credits_used: 0 };
  }

  const query = country
    ? `"${companyName}" ${country} company import export`
    : `"${companyName}" company import export B2B`;

  try {
    const res = await client.get('/web/search', {
      params: { q: query, count: 5, text_decorations: false, search_lang: 'en' },
      headers: {
        'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY,
        Accept: 'application/json',
      },
    });

    const results = res.data.web?.results || [];
    if (!results.length) {
      return { source: 'brave', data: {}, fetchedAt: new Date(), status: 'not_found', credits_used: 1 };
    }

    // Extract company domain from search results
    const domains = results
      .map((r: any) => {
        try {
          return new URL(r.url).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Filter out non-company domains (social, directories, trade data aggregators)
    const excludeDomains = [
      'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com',
      'wikipedia.org', 'bloomberg.com', 'crunchbase.com', 'glassdoor.com', 'indeed.com', 'yelp.com',
      'volza.com', 'importgenius.com', 'panjiva.com', 'trademap.org', 'zauba.com',
      'seair.co.in', 'infodriveindia.com', 'eximpedia.app', 'tradeimex.in', 'exportgenius.in',
      'dnb.com', 'zoominfo.com', 'hoovers.com', 'manta.com', 'yellowpages.com',
      'signalhire.com', 'rocketreach.com', 'contactout.com', 'lusha.com', 'apollo.io',
    ];
    const companyDomains = domains.filter((d: string) => !excludeDomains.some((ex) => d.includes(ex)));

    return {
      source: 'brave',
      data: {
        query,
        topResults: results.slice(0, 5).map((r: any) => ({
          title: r.title,
          url: r.url,
          description: r.description,
        })),
        likelyDomain: companyDomains[0] || null,
        allDomains: [...new Set(companyDomains)].slice(0, 5),
      },
      fetchedAt: new Date(),
      status: 'success',
      credits_used: 1,
    };
  } catch (err: any) {
    const status = err.response?.status;
    logger.error('Brave search failed', { companyName, status, error: err.message });
    return {
      source: 'brave',
      data: {},
      fetchedAt: new Date(),
      status: status === 429 ? 'rate_limited' : 'error',
      credits_used: 0,
    };
  }
}
