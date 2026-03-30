import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { ContactInfo, EnrichmentResult } from '../../types';

const client = axios.create({
  baseURL: 'https://api.hunter.io/v2',
  timeout: 30_000,
});

export async function hunterDomainSearch(domain: string): Promise<EnrichmentResult> {
  if (!env.HUNTER_API_KEY || !domain) {
    return { source: 'hunter', data: {}, fetchedAt: new Date(), status: 'error', credits_used: 0 };
  }

  try {
    const res = await client.get('/domain-search', {
      params: { domain, api_key: env.HUNTER_API_KEY, limit: 10 },
    });

    const data = res.data.data;
    if (!data || !data.emails?.length) {
      return { source: 'hunter', data: {}, fetchedAt: new Date(), status: 'not_found', credits_used: 1 };
    }

    return {
      source: 'hunter',
      data: {
        domain: data.domain,
        organization: data.organization,
        pattern: data.pattern,
        emailCount: data.emails.length,
        emails: data.emails.map((e: any) => ({
          email: e.value,
          type: e.type,
          confidence: e.confidence,
          firstName: e.first_name,
          lastName: e.last_name,
          position: e.position,
          department: e.department,
          linkedin: e.linkedin,
        })),
      },
      fetchedAt: new Date(),
      status: 'success',
      credits_used: 1,
    };
  } catch (err: any) {
    const status = err.response?.status;
    logger.error('Hunter domain search failed', { domain, status, error: err.message });
    return {
      source: 'hunter',
      data: {},
      fetchedAt: new Date(),
      status: status === 429 ? 'rate_limited' : 'error',
      credits_used: 0,
    };
  }
}

export async function hunterEmailVerify(email: string): Promise<{ valid: boolean; score: number }> {
  if (!env.HUNTER_API_KEY) return { valid: false, score: 0 };

  try {
    const res = await client.get('/email-verifier', {
      params: { email, api_key: env.HUNTER_API_KEY },
    });
    const data = res.data.data;
    return { valid: data.result === 'deliverable', score: data.score || 0 };
  } catch (err: any) {
    logger.error('Hunter email verify failed', { email, error: err.message });
    return { valid: false, score: 0 };
  }
}

export function hunterExtractContacts(enrichmentResult: EnrichmentResult): ContactInfo[] {
  if (enrichmentResult.status !== 'success') return [];
  const emails = (enrichmentResult.data as any).emails || [];
  return emails
    .filter((e: any) => e.email && e.confidence >= 70)
    .map((e: any) => ({
      name: [e.firstName, e.lastName].filter(Boolean).join(' ') || null,
      title: e.position || null,
      email: e.email,
      emailVerified: e.confidence >= 90,
      phone: null,
      linkedin: e.linkedin || null,
      source: 'hunter' as const,
      discoveredAt: new Date(),
    }));
}
