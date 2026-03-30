import { ollamaGenerate, ollamaHealthCheck } from './ollama';
import { siliconflowGenerate } from './siliconflow';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import type { AIRequest, AIResponse, BuyerTier } from '../../types';

/**
 * Tiered AI routing (all via DeepInfra OpenAI-compatible API):
 *  - standard: Qwen3-8B  (QWEN_8B_API_KEY)  → fallback to 32B
 *  - premium:  Qwen3-32B (QWEN_32B_API_KEY)
 *  - top:      Qwen3-235B-A22B (QWEN_235B_API_KEY)
 */
export async function aiGenerate(request: AIRequest): Promise<AIResponse> {
  const { prompt, systemPrompt, tier, maxTokens, temperature } = request;

  logger.info('AI request', { tier, promptLength: prompt.length });

  // Standard tier: try 8B first, fallback to 32B
  if (tier === 'standard') {
    try {
      const available = await ollamaHealthCheck();
      if (available) {
        return await ollamaGenerate(prompt, systemPrompt, { maxTokens, temperature });
      }
      logger.warn('DeepInfra 8B not available, falling back to 32B');
    } catch (err: any) {
      logger.warn('DeepInfra 8B failed, falling back to 32B', { error: err.message });
    }
  }

  // Premium / Top / fallback: use 32B or 235B
  const apiKey = tier === 'top' ? env.QWEN_235B_API_KEY : env.QWEN_32B_API_KEY;
  if (!apiKey) {
    throw new Error(`API key required for tier "${tier}" but not configured`);
  }

  return await siliconflowGenerate(prompt, tier, systemPrompt, { maxTokens, temperature });
}

// ── Specialized prompts ─────────────────────────────────

export async function classifyBuyer(
  companyName: string,
  products: string[],
  country: string,
  shipmentCount: number
): Promise<AIResponse> {
  const prompt = `Classify this importer/buyer for B2B outreach targeting.

Company: ${companyName}
Country: ${country}
Products: ${products.slice(0, 10).join(', ')}
Total Shipments: ${shipmentCount}

Respond in JSON only:
{
  "industry": "primary industry",
  "subIndustry": "sub-industry",
  "companyType": "manufacturer|distributor|retailer|wholesaler|trading_company|unknown",
  "estimatedSize": "small|medium|large|enterprise",
  "buyingPattern": "description of buying behavior",
  "outreachPriority": 1-10,
  "confidence": 0.0-1.0
}`;

  return aiGenerate({ prompt, tier: 'standard', temperature: 0.2 });
}

export async function analyzeBuyerDeep(
  companyName: string,
  tradeData: Record<string, unknown>,
  enrichmentData: Record<string, unknown>
): Promise<AIResponse> {
  const prompt = `Deep analysis of buyer for premium outreach strategy.

Company: ${companyName}
Trade Data: ${JSON.stringify(tradeData, null, 2)}
Enrichment Data: ${JSON.stringify(enrichmentData, null, 2)}

Provide comprehensive analysis in JSON:
{
  "companyProfile": "2-3 sentence company description",
  "buyingBehavior": {
    "frequency": "weekly|monthly|quarterly|sporadic",
    "avgOrderValue": "estimated range",
    "preferredSupplierTypes": ["list"],
    "seasonality": "any seasonal patterns"
  },
  "decisionMakers": "likely decision maker roles",
  "painPoints": ["likely pain points based on trade patterns"],
  "outreachStrategy": {
    "channel": "email|linkedin|phone",
    "timing": "best timing recommendation",
    "messageAngle": "recommended approach angle",
    "valueProposition": "what to lead with"
  },
  "competitorIndicators": ["any competitor patterns visible"],
  "score": 1-100,
  "confidence": 0.0-1.0
}`;

  const tier: BuyerTier = (tradeData as any)?.totalShipments > 100 ? 'top' : 'premium';
  return aiGenerate({ prompt, tier, maxTokens: 4096, temperature: 0.3 });
}
