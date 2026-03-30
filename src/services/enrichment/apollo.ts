import axios from 'axios';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import type { ContactInfo, EnrichmentResult } from '../../types';

function getApolloClient() {
  return axios.create({
    baseURL: 'https://api.apollo.io/v1',
    timeout: 30_000,
    headers: { 
      'Content-Type': 'application/json',
      'X-Api-Key': env.APOLLO_API_KEY,
    },
  });
}

export async function apolloSearchCompany(companyName: string, domain?: string): Promise<EnrichmentResult> {
  if (!env.APOLLO_API_KEY) {
    logger.warn('Apollo API key not configured');
    return { source: 'apollo', data: {}, fetchedAt: new Date(), status: 'error', credits_used: 0 };
  }

  const client = getApolloClient();

  try {
    // Apollo API requires at least a domain - if no domain, skip the call
    if (!domain) {
      logger.warn('Apollo requires domain - skipping', { companyName });
      return { source: 'apollo', data: {}, fetchedAt: new Date(), status: 'not_found', credits_used: 0 };
    }

    const res = await client.post('/organizations/enrich', {
      domain: domain,
    });

    const org = res.data.organization;
    if (!org) {
      return { source: 'apollo', data: {}, fetchedAt: new Date(), status: 'not_found', credits_used: 1 };
    }

    return {
      source: 'apollo',
      data: {
        name: org.name,
        domain: org.primary_domain,
        industry: org.industry,
        subIndustry: org.sub_industry,
        employeeCount: org.estimated_num_employees,
        revenue: org.annual_revenue_printed,
        founded: org.founded_year,
        linkedin: org.linkedin_url,
        description: org.short_description,
        city: org.city,
        state: org.state,
        country: org.country,
        technologies: org.current_technologies?.map((t: any) => t.name) || [],
      },
      fetchedAt: new Date(),
      status: 'success',
      credits_used: 1,
    };
  } catch (err: any) {
    const status = err.response?.status;
    const errorData = err.response?.data;
    logger.error('Apollo company search failed', { 
      companyName, 
      domain,
      status, 
      error: err.message,
      errorData: errorData 
    });
    return {
      source: 'apollo',
      data: {},
      fetchedAt: new Date(),
      status: status === 429 ? 'rate_limited' : 'error',
      credits_used: 0,
    };
  }
}

/** Map Apollo raw person object to ContactInfo */
function mapPerson(p: any): ContactInfo {
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    title: p.title || null,
    email: p.email || '',
    emailVerified: p.email_status === 'verified',
    phone: p.phone_numbers?.[0]?.sanitized_number || null,
    linkedin: p.linkedin_url || null,
    source: 'apollo' as const,
    discoveredAt: new Date(),
  };
}

/** Extract useful contacts from Apollo people array */
function extractContacts(people: any[]): ContactInfo[] {
  return people
    .map(mapPerson)
    .filter((c: ContactInfo) => c.name || c.email || c.linkedin);
}

export async function apolloFindContacts(
  companyName: string,
  domain?: string,
  titles: string[] = ['CEO', 'COO', 'Procurement', 'Import', 'Purchase', 'Supply Chain', 'Sourcing']
): Promise<ContactInfo[]> {
  if (!env.APOLLO_API_KEY) {
    logger.warn('Apollo API key not configured — skipping contact search');
    return [];
  }

  const client = getApolloClient();

  const payload = {
    q_organization_name: companyName || undefined,
    organization_domains: domain ? [domain] : undefined,
    person_titles: titles,
    page: 1,
    per_page: 10,
  };

  // Attempt 1: /mixed_people/search (requires paid plan)
  try {
    const res = await client.post('/mixed_people/search', payload);
    const people = res.data.people || [];
    const contacts = extractContacts(people);
    logger.info('Apollo mixed_people/search succeeded', { companyName, domain, found: contacts.length });
    return contacts;
  } catch (err: any) {
    const status = err.response?.status;

    if (status === 403) {
      // 403 = plan restriction, not a real error — fall through to people/search
      logger.warn('Apollo mixed_people/search requires paid plan (403) — trying people/search fallback', { companyName, domain });
    } else if (status === 429) {
      logger.warn('Apollo rate limited (429)', { companyName });
      return [];
    } else {
      logger.warn('Apollo mixed_people/search failed', { companyName, domain, status, error: err.message });
    }
  }

  // Attempt 2: /people/search (sometimes available on basic plan)
  try {
    const res = await client.post('/people/search', payload);
    const people = res.data.people || [];
    const contacts = extractContacts(people);
    logger.info('Apollo people/search succeeded', { companyName, domain, found: contacts.length });
    return contacts;
  } catch (err: any) {
    const status = err.response?.status;

    if (status === 403) {
      logger.warn('Apollo people/search also requires paid plan (403) — contact search unavailable on current plan', { companyName, domain });
    } else if (status === 429) {
      logger.warn('Apollo rate limited (429)', { companyName });
    } else {
      logger.warn('Apollo people/search failed', { companyName, domain, status, error: err.message });
    }
    return [];
  }
}
