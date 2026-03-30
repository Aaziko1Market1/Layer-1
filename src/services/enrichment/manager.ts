import { ObjectId } from 'mongodb';
import { getBuyerDb } from '../../config/mongodb';
import { logger } from '../../config/logger';
import { apolloSearchCompany, apolloFindContacts } from './apollo';
import { hunterDomainSearch, hunterExtractContacts } from './hunter';
import { snovDomainSearch, snovExtractContacts } from './snov';
import { verifyEmailBatch } from './zerobounce';
import { braveSearchCompany } from './brave';
import type { BuyerProfile, ContactInfo, EnrichmentJob, EnrichmentStep } from '../../types';

/**
 * Enrichment pipeline orchestrator.
 * Steps: Brave(domain) → Apollo(company+contacts) → Hunter(domain) → Snov(fallback) → ZeroBounce(verify)
 */
export async function enrichBuyer(profile: BuyerProfile): Promise<BuyerProfile> {
  const db = getBuyerDb();
  const jobId = new ObjectId();
  const now = new Date();

  const steps: EnrichmentStep[] = [
    { name: 'brave_search', provider: 'brave', status: 'pending', result: null, startedAt: null, completedAt: null },
    { name: 'apollo_company', provider: 'apollo', status: 'pending', result: null, startedAt: null, completedAt: null },
    { name: 'apollo_contacts', provider: 'apollo', status: 'pending', result: null, startedAt: null, completedAt: null },
    { name: 'hunter_domain', provider: 'hunter', status: 'pending', result: null, startedAt: null, completedAt: null },
    { name: 'snov_fallback', provider: 'snov', status: 'pending', result: null, startedAt: null, completedAt: null },
    { name: 'email_verify', provider: 'zerobounce', status: 'pending', result: null, startedAt: null, completedAt: null },
  ];

  const job: EnrichmentJob = {
    _id: jobId,
    buyerProfileId: profile._id!,
    companyName: profile.companyName,
    steps,
    status: 'processing',
    priority: 5,
    attempts: 1,
    maxAttempts: 3,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await db.collection('enrichment_jobs').insertOne(job);
  logger.info('Enrichment job started', { jobId: jobId.toString(), company: profile.companyName });

  let domain = profile.domain;
  const allContacts: ContactInfo[] = [...profile.contacts];

  try {
    // Step 1: Brave Search — discover domain if missing
    if (!domain) {
      updateStep(steps, 'brave_search', 'running');
      const braveResult = await braveSearchCompany(profile.companyName, profile.country);
      updateStep(steps, 'brave_search', braveResult.status === 'success' ? 'done' : 'failed', braveResult);
      profile.enrichment.brave = braveResult;

      if (braveResult.status === 'success') {
        domain = (braveResult.data as any).likelyDomain || null;
        if (domain) profile.domain = domain;
      }
    } else {
      updateStep(steps, 'brave_search', 'skipped');
    }

    // Step 2: Apollo company enrichment
    updateStep(steps, 'apollo_company', 'running');
    const apolloResult = await apolloSearchCompany(profile.companyName, domain || undefined);
    updateStep(steps, 'apollo_company', apolloResult.status === 'success' ? 'done' : 'failed', apolloResult);
    profile.enrichment.apollo = apolloResult;

    if (apolloResult.status === 'success' && !domain) {
      domain = (apolloResult.data as any).domain || null;
      if (domain) profile.domain = domain;
    }

    // Step 3: Apollo contacts
    updateStep(steps, 'apollo_contacts', 'running');
    const apolloContacts = await apolloFindContacts(profile.companyName, domain || undefined);
    updateStep(steps, 'apollo_contacts', apolloContacts.length > 0 ? 'done' : 'failed', { count: apolloContacts.length });
    allContacts.push(...apolloContacts);

    // Step 4: Hunter domain search (if we have a domain)
    if (domain) {
      updateStep(steps, 'hunter_domain', 'running');
      const hunterResult = await hunterDomainSearch(domain);
      updateStep(steps, 'hunter_domain', hunterResult.status === 'success' ? 'done' : 'failed', hunterResult);
      profile.enrichment.hunter = hunterResult;
      allContacts.push(...hunterExtractContacts(hunterResult));
    } else {
      updateStep(steps, 'hunter_domain', 'skipped');
    }

    // Step 5: Snov fallback (if we have few contacts)
    if (domain && allContacts.length < 3) {
      updateStep(steps, 'snov_fallback', 'running');
      const snovResult = await snovDomainSearch(domain);
      updateStep(steps, 'snov_fallback', snovResult.status === 'success' ? 'done' : 'failed', snovResult);
      profile.enrichment.snov = snovResult;
      allContacts.push(...snovExtractContacts(snovResult));
    } else {
      updateStep(steps, 'snov_fallback', 'skipped');
    }

    // Step 6: Email verification
    const unverifiedEmails = allContacts.filter((c) => !c.emailVerified).map((c) => c.email);
    if (unverifiedEmails.length > 0) {
      updateStep(steps, 'email_verify', 'running');
      const verifications = await verifyEmailBatch(unverifiedEmails);
      const verifiedSet = new Set(verifications.filter((v) => v.valid).map((v) => v.email));
      allContacts.forEach((c) => {
        if (verifiedSet.has(c.email)) c.emailVerified = true;
      });
      updateStep(steps, 'email_verify', 'done', { verified: verifiedSet.size, total: unverifiedEmails.length });
    } else {
      updateStep(steps, 'email_verify', 'skipped');
    }

    // Deduplicate contacts by email
    const seen = new Set<string>();
    profile.contacts = allContacts.filter((c) => {
      if (!c.email || seen.has(c.email.toLowerCase())) return false;
      seen.add(c.email.toLowerCase());
      return true;
    });

    profile.status = 'enriched';
    profile.updatedAt = new Date();

    // Update DB
    await db.collection('buyer_profiles').updateOne(
      { _id: profile._id },
      { $set: { domain: profile.domain, contacts: profile.contacts, enrichment: profile.enrichment, status: profile.status, updatedAt: profile.updatedAt } }
    );

    job.status = 'completed';
    job.completedAt = new Date();
    job.updatedAt = new Date();
    await db.collection('enrichment_jobs').updateOne({ _id: jobId }, { $set: { steps, status: 'completed', completedAt: job.completedAt, updatedAt: job.updatedAt } });

    logger.info('Enrichment completed', { company: profile.companyName, contacts: profile.contacts.length, domain: profile.domain });
    return profile;
  } catch (err: any) {
    logger.error('Enrichment failed', { company: profile.companyName, error: err.message });
    await db.collection('enrichment_jobs').updateOne(
      { _id: jobId },
      { $set: { steps, status: 'failed', error: err.message, updatedAt: new Date() } }
    );
    throw err;
  }
}

function updateStep(steps: EnrichmentStep[], name: string, status: EnrichmentStep['status'], result?: unknown) {
  const step = steps.find((s) => s.name === name);
  if (!step) return;
  step.status = status;
  if (status === 'running') step.startedAt = new Date();
  if (['done', 'failed', 'skipped'].includes(status)) step.completedAt = new Date();
  if (result !== undefined) step.result = result;
}
