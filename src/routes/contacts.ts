import { Router, Request, Response } from 'express';
import { MongoClient } from 'mongodb';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { SequentialEnrichmentAgent } from '../services/agents/sequential-enrichment.agent';

const router = Router();

async function getDhruval() {
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  return { client, db: client.db('Dhruval') };
}

// GET /api/contacts — list all enriched contacts that have emails/phones
router.get('/', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const { hasEmail = '', limit = '100', skip = '0' } = req.query as Record<string, string>;

    const filter: Record<string, any> = {};
    if (hasEmail === 'true') {
      filter['contacts_found'] = { $elemMatch: { email: { $exists: true, $ne: null } } };
    }

    const contacts = await db.collection('enriched_contacts')
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(parseInt(skip))
      .limit(Math.min(parseInt(limit), 500))
      .toArray();

    const total = await db.collection('enriched_contacts').countDocuments(filter);

    const result = contacts.map(ec => {
      const found = ec.contacts_found || [];
      const emails = [...new Set(found.filter((c: any) => c.email).map((c: any) => c.email))];
      const phones = [...new Set(found.filter((c: any) => c.phone).map((c: any) => c.phone))];
      const linkedins = [...new Set(found.filter((c: any) => c.linkedin).map((c: any) => c.linkedin))];
      return {
        _id: ec._id,
        company_name: ec.company_name,
        country: ec.country,
        domain: ec.domain_found,
        status: ec.status,
        enrichedAt: ec.updatedAt,
        emails,
        phones,
        linkedins,
        contactCount: emails.length + phones.length,
        steps: ec.steps ? Object.entries(ec.steps).map(([k, v]: [string, any]) => ({
          name: k,
          ok: !v.error,
          count: v.count ?? v.verified?.length ?? 0,
          error: v.error || null,
        })) : [],
      };
    });

    res.json({ contacts: result, total });
  } catch (err: any) {
    logger.error('Contacts list failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// POST /api/contacts/enrich — run sequential enrichment on selected buyers
router.post('/enrich', async (req: Request, res: Response) => {
  const { buyerNames, limit = 5 } = req.body;
  const { client, db } = await getDhruval();
  try {
    let buyers: any[];
    if (buyerNames && buyerNames.length > 0) {
      buyers = await db.collection('shortlist_buyer_seller')
        .find({ name: { $in: buyerNames }, type: 'buyer' })
        .limit(20)
        .toArray();
    } else {
      // Auto-pick buyers not yet enriched
      const enrichedNames = await db.collection('enriched_contacts').distinct('company_name');
      buyers = await db.collection('shortlist_buyer_seller')
        .find({
          type: 'buyer',
          name: { $exists: true, $nin: [...enrichedNames, null, '', 'NULL', 'N/A'], $not: /^TO THE ORDER|^TO ORDER|^SAME AS/i },
        })
        .sort({ totalAmount: -1 })
        .limit(Math.min(parseInt(String(limit)), 20))
        .toArray();
    }

    if (buyers.length === 0) {
      return res.json({ message: 'No buyers to enrich', queued: 0 }) as any;
    }

    res.json({ message: `Starting enrichment for ${buyers.length} buyers`, queued: buyers.length, buyers: buyers.map(b => b.name) });

    // Run enrichment in background (non-blocking)
    setImmediate(async () => {
      const agent = new SequentialEnrichmentAgent();
      for (const buyer of buyers) {
        try {
          const profile: any = {
            companyName: buyer.name,
            normalizedName: buyer.name,
            country: buyer.country || 'Unknown',
            domain: null,
            tier: 'standard',
            industry: null,
            subIndustry: null,
            products: buyer.products || [],
            hsCodes: buyer.hsCodes || [],
            contacts: [],
            enrichment: { apollo: null, hunter: null, snov: null, brave: null },
            aiAnalysis: { classification: null, buyingPatterns: null, recommendedApproach: null, model: null, analyzedAt: null },
            tradeStats: {
              totalShipments: buyer.transactionCount || 0,
              totalValue: buyer.totalAmount || 0,
              avgShipmentValue: 0,
              topOriginCountries: [],
              topPorts: [],
              dateRange: { first: new Date(), last: new Date() },
              frequency: 'sporadic',
            },
            status: 'raw',
            score: buyer.lead_score || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          const result = await agent.enrich(profile);

          // Save to enriched_contacts (legacy)
          await db.collection('enriched_contacts').updateOne(
            { company_name: buyer.name },
            { $set: { ...result, updatedAt: new Date() } },
            { upsert: true }
          );

          // Also save to shortlist_buyer_seller.contact_details (new pipeline format)
          const found = result.contacts_found || [];
          const contact_details = found
            .filter((c: any) => c.email || c.phone || c.name || c.linkedin)
            .map((c: any) => ({
              email: c.email || null, phone: c.phone || null,
              name: c.name || null, position: c.title || c.position || null,
              linkedin: c.linkedin || null, source: c.source || 'pipeline',
            }));
          const emails = [...new Set(found.filter((c: any) => c.email).map((c: any) => c.email as string))];
          const phones = [...new Set(found.filter((c: any) => c.phone).map((c: any) => c.phone as string))];
          const linkedins = [...new Set(found.filter((c: any) => c.linkedin).map((c: any) => c.linkedin as string))];

          // Build step summary for the scraper panel
          const steps = result.steps || {};
          const googleStep = steps.google || {};
          const globalStep = steps.global || {};
          const apolloStep = steps.apollo || {};
          const enrichment_steps_summary = {
            google: {
              success: googleStep.success !== false,
              results: (googleStep.results || []).length,
              biz_phone: googleStep.business_info?.phone || null,
              biz_website: googleStep.business_info?.website || null,
              biz_address: googleStep.business_info?.address || null,
              biz_rating: googleStep.business_info?.rating || null,
              emails_found: found.filter((c: any) => c.source === 'search' || c.source === 'google_business').filter((c: any) => c.email).length,
              phones_found: found.filter((c: any) => c.source === 'google_business' || c.source === 'search').filter((c: any) => c.phone).length,
            },
            global: {
              success: globalStep.success !== false,
              pages_scraped: globalStep.data?.stats?.scraped || 0,
              emails_found: found.filter((c: any) => c.source === 'global').filter((c: any) => c.email).length,
              phones_found: found.filter((c: any) => c.source === 'global').filter((c: any) => c.phone).length,
            },
            apollo: {
              success: apolloStep.success !== false,
              domain: apolloStep.domain || result.domain_found || null,
              org_phone: apolloStep.contacts?.find((c: any) => c.source === 'apollo_org')?.phone || null,
              org_linkedin: apolloStep.contacts?.find((c: any) => c.source === 'apollo_org')?.linkedin || null,
              people: (apolloStep.contacts || [])
                .filter((c: any) => c.source === 'apollo_people')
                .map((c: any) => ({ name: c.name, title: c.title, linkedin: c.linkedin })),
            },
          };

          await db.collection('shortlist_buyer_seller').updateOne(
            { name: buyer.name, type: 'buyer' },
            {
              $set: {
                contact_details,
                primary_email: emails[0] || null,
                all_emails: emails, all_phones: phones, all_linkedins: linkedins,
                domain_found: result.domain_found || null,
                enrichment_status: 'done',
                enrichment_done_at: new Date(),
                enrichment_steps_summary,
              }
            }
          );

          logger.info(`Enriched: ${buyer.name} — ${emails.length} emails, ${phones.length} phones`);
        } catch (err: any) {
          logger.error(`Enrichment failed for ${buyer.name}: ${err.message}`);
        }
      }
      await client.close();
    });

    return;
  } catch (err: any) {
    logger.error('Enrich trigger failed', { error: err.message });
    await client.close();
    res.status(500).json({ error: err.message });
  }
});

export default router;
