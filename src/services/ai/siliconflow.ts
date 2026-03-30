import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { AIResponse, BuyerTier } from '../../types';

function getModel(tier: BuyerTier): string {
  return tier === 'top' ? 'Qwen/Qwen3-235B-A22B' : 'Qwen/Qwen3-32B';
}

function getEndpoint(tier: BuyerTier): string {
  return tier === 'top' ? env.QWEN_235B_ENDPOINT : env.QWEN_32B_ENDPOINT;
}

export async function siliconflowGenerate(
  prompt: string,
  tier: BuyerTier = 'standard',
  systemPrompt?: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<AIResponse> {
  const apiKey = tier === 'top' ? env.QWEN_235B_API_KEY : env.QWEN_32B_API_KEY;
  if (!apiKey) {
    throw new Error(`API key not configured for tier "${tier}"`);
  }

  const model = getModel(tier);
  const endpoint = getEndpoint(tier);
  const start = Date.now();

  try {
    const client = axios.create({
      baseURL: endpoint,
      timeout: 180_000,
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await client.post(
      '/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are a trade data analyst specializing in buyer intelligence. Be precise and factual. If data is insufficient, respond with NOT_FOUND.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    const latencyMs = Date.now() - start;
    const choice = res.data.choices?.[0];
    const usage = res.data.usage || {};

    logger.debug('DeepInfra response', { model, tier, latencyMs });

    return {
      content: choice?.message?.content || '',
      model,
      tokensUsed: {
        prompt: usage.prompt_tokens || 0,
        completion: usage.completion_tokens || 0,
      },
      latencyMs,
    };
  } catch (err: any) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    logger.error('DeepInfra generation failed', { model, tier, status, error: msg });
    throw new Error(`DeepInfra error (${status}): ${msg}`);
  }
}
