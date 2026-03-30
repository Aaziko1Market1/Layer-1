import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { AIResponse } from '../../types';

const DEEPINFRA_MODEL = 'Qwen/Qwen3-30B-A3B';

const client = axios.create({
  baseURL: env.QWEN_8B_ENDPOINT,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

export async function ollamaGenerate(
  prompt: string,
  systemPrompt?: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<AIResponse> {
  const start = Date.now();

  const apiKey = env.QWEN_8B_API_KEY;
  if (!apiKey) {
    throw new Error('QWEN_8B_API_KEY not configured for DeepInfra');
  }

  try {
    const res = await client.post(
      '/chat/completions',
      {
        model: DEEPINFRA_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are a trade data analyst. Be precise and factual. If data is insufficient, respond with NOT_FOUND.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2048,
        stream: false,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    const latencyMs = Date.now() - start;
    const choice = res.data.choices?.[0];
    const usage = res.data.usage || {};

    logger.debug('DeepInfra 8B response', { model: DEEPINFRA_MODEL, latencyMs });

    return {
      content: choice?.message?.content || '',
      model: DEEPINFRA_MODEL,
      tokensUsed: {
        prompt: usage.prompt_tokens || 0,
        completion: usage.completion_tokens || 0,
      },
      latencyMs,
    };
  } catch (err: any) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    logger.error('DeepInfra 8B generation failed', { model: DEEPINFRA_MODEL, status, error: msg });
    throw new Error(`DeepInfra 8B error (${status}): ${msg}`);
  }
}

export async function ollamaHealthCheck(): Promise<boolean> {
  // DeepInfra is always "available" if API key is set
  if (!env.QWEN_8B_API_KEY) {
    return false;
  }
  try {
    // Quick test call to verify the key works
    const res = await axios.get(`${env.QWEN_8B_ENDPOINT}/models`, {
      headers: { Authorization: `Bearer ${env.QWEN_8B_API_KEY}` },
      timeout: 5000,
    });
    return res.status === 200;
  } catch {
    // Even if /models fails, the chat endpoint may still work
    // Return true if key is configured — actual errors will surface on generate
    return !!env.QWEN_8B_API_KEY;
  }
}
