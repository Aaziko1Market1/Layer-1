import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { ContactInfo, EnrichmentResult } from '../../types';

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await axios.post('https://api.snov.io/v1/oauth/access_token', {
    grant_type: 'client_credentials',
    client_id: env.SNOV_CLIENT_ID,
    client_secret: env.SNOV_CLIENT_SECRET,
  });

  accessToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return accessToken!;
}

export async function snovDomainSearch(domain: string): Promise<EnrichmentResult> {
  if (!env.SNOV_CLIENT_ID || !domain) {
    return { source: 'snov', data: {}, fetchedAt: new Date(), status: 'error', credits_used: 0 };
  }

  try {
    const token = await getToken();
    const res = await axios.post('https://api.snov.io/v2/domain-emails-with-info', {
      access_token: token,
      domain,
      type: 'all',
      limit: 10,
    });

    const data = res.data;
    if (!data.emails?.length) {
      return { source: 'snov', data: {}, fetchedAt: new Date(), status: 'not_found', credits_used: 1 };
    }

    return {
      source: 'snov',
      data: {
        domain,
        companyName: data.companyName,
        emails: data.emails.map((e: any) => ({
          email: e.email,
          firstName: e.firstName,
          lastName: e.lastName,
          position: e.position,
          status: e.status,
        })),
      },
      fetchedAt: new Date(),
      status: 'success',
      credits_used: 1,
    };
  } catch (err: any) {
    const status = err.response?.status;
    logger.error('Snov domain search failed', { domain, status, error: err.message });
    return {
      source: 'snov',
      data: {},
      fetchedAt: new Date(),
      status: status === 429 ? 'rate_limited' : 'error',
      credits_used: 0,
    };
  }
}

export function snovExtractContacts(enrichmentResult: EnrichmentResult): ContactInfo[] {
  if (enrichmentResult.status !== 'success') return [];
  const emails = (enrichmentResult.data as any).emails || [];
  return emails
    .filter((e: any) => e.email)
    .map((e: any) => ({
      name: [e.firstName, e.lastName].filter(Boolean).join(' ') || null,
      title: e.position || null,
      email: e.email,
      emailVerified: e.status === 'valid',
      phone: null,
      linkedin: null,
      source: 'snov' as const,
      discoveredAt: new Date(),
    }));
}
