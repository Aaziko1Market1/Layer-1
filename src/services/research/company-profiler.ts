import { logger } from '../../config/logger';
import { getBuyerDb } from '../../config/mongodb';
import { aiGenerate } from '../ai/router';
import type { BuyerProfile } from '../../models/buyer';

/**
 * Company Profiler Agent — enriches buyer profiles with company intelligence.
 * Uses Brave Search for domain discovery, Apollo for org data,
 * and AI for classification.
 */
export class CompanyProfilerAgent {
  async profile(buyer: BuyerProfile): Promise<Record<string, unknown>> {
    logger.info('CompanyProfiler: profiling', { buyer: buyer.buyer_name });

    const prompt = `Analyze this import/export company for B2B outreach:
Company: ${buyer.buyer_name}
Country: ${buyer.country}
Products: ${buyer.product_descriptions.slice(0, 5).join(', ')}
HS Codes: ${buyer.hs_codes.slice(0, 10).join(', ')}
Trade Volume: $${buyer.total_trade_volume_usd.toLocaleString()}
Trade Count: ${buyer.trade_count}
Tier: ${buyer.buyer_tier}

Respond JSON: { "industry", "sub_industry", "company_type", "estimated_size", "confidence" }`;

    const response = await aiGenerate({ prompt, tier: 'standard', temperature: 0.2 });

    let parsed: Record<string, unknown> = {};
    try {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      parsed = { raw: response.content };
    }

    return { ...parsed, model: response.model, latency_ms: response.latencyMs };
  }
}
