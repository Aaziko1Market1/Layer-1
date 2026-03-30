import { logger } from '../../config/logger';
import { aiGenerate } from '../ai/router';
import type { BuyerProfile } from '../../models/buyer';

/**
 * Trade Analyzer Agent — analyzes buying patterns, seasonality,
 * supplier relationships from trade data.
 */
export class TradeAnalyzerAgent {
  async analyze(buyer: BuyerProfile): Promise<Record<string, unknown>> {
    logger.info('TradeAnalyzer: analyzing', { buyer: buyer.buyer_name });

    const prompt = `Analyze the trade patterns for this buyer:
Company: ${buyer.buyer_name}
Country: ${buyer.country}
Total Shipments: ${buyer.trade_count}
Volume USD: $${buyer.total_trade_volume_usd.toLocaleString()}
Frequency: ${buyer.trade_frequency}
Top Origin Countries: ${buyer.origin_countries.slice(0, 5).join(', ')}
Top Ports: ${buyer.ports_used.slice(0, 5).join(', ')}
HS Codes: ${buyer.hs_codes.slice(0, 10).join(', ')}
First Trade: ${buyer.first_trade_date}
Last Trade: ${buyer.last_trade_date}
Indian Suppliers: ${buyer.indian_suppliers.length}

Respond JSON: { "buying_pattern", "seasonality", "growth_trend", "supplier_diversity", "risk_level", "recommended_approach" }`;

    const response = await aiGenerate({ prompt, tier: 'standard', temperature: 0.3 });

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
