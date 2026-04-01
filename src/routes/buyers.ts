import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { MongoClient } from 'mongodb';
import { logger } from '../config/logger';
import { env } from '../config/env';

const router = Router();

function mergeScraperSummaries(newPipeline: any, legacy: any): any {
  if (!newPipeline && !legacy) return null;
  if (!newPipeline) return legacy;
  if (!legacy) return newPipeline;

  const pick = (a: any, b: any, key: string) => a?.[key] || b?.[key] || null;
  const pickNum = (a: any, b: any, key: string) => (a?.[key] || 0) > (b?.[key] || 0) ? a?.[key] : b?.[key] || 0;

  return {
    google: {
      success: newPipeline.google?.success || legacy.google?.success,
      results: pickNum(newPipeline.google, legacy.google, 'results'),
      biz_phone: pick(newPipeline.google, legacy.google, 'biz_phone'),
      biz_website: pick(newPipeline.google, legacy.google, 'biz_website'),
      biz_address: pick(newPipeline.google, legacy.google, 'biz_address'),
      biz_rating: pick(newPipeline.google, legacy.google, 'biz_rating'),
      emails_found: pickNum(newPipeline.google, legacy.google, 'emails_found'),
      phones_found: pickNum(newPipeline.google, legacy.google, 'phones_found'),
    },
    global: {
      success: newPipeline.global?.success || legacy.global?.success,
      pages_scraped: pickNum(newPipeline.global, legacy.global, 'pages_scraped'),
      industry: pick(newPipeline.global, legacy.global, 'industry'),
      description: pick(newPipeline.global, legacy.global, 'description'),
      website: pick(newPipeline.global, legacy.global, 'website'),
      address: pick(newPipeline.global, legacy.global, 'address'),
      emails_found: pickNum(newPipeline.global, legacy.global, 'emails_found'),
      phones_found: pickNum(newPipeline.global, legacy.global, 'phones_found'),
    },
    apollo: {
      success: newPipeline.apollo?.success || legacy.apollo?.success,
      domain: pick(newPipeline.apollo, legacy.apollo, 'domain'),
      org_phone: pick(newPipeline.apollo, legacy.apollo, 'org_phone'),
      org_linkedin: pick(newPipeline.apollo, legacy.apollo, 'org_linkedin'),
      people: (newPipeline.apollo?.people?.length > 0 ? newPipeline.apollo.people : legacy.apollo?.people) || [],
    },
  };
}

async function getDhruval() {
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  return { client, db: client.db('Dhruval') };
}

// GET /api/buyers — list buyers from shortlist_buyer_seller + join enriched_contacts
router.get('/', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const {
      search = '', country = '', limit = '50', skip = '0',
      hasContact = '', sort = 'totalAmount',
      productSearch = '', category = '',
      statusFilter = '', minScore = '', maxScore = '',
      sortDir = 'desc',
    } = req.query as Record<string, string>;

    const filter: Record<string, any> = {
      type: 'buyer',
      name: { $exists: true, $nin: [null, '', 'NULL', 'N/A'], $not: /^TO THE ORDER|^TO ORDER|^SAME AS/i },
    };
    if (search) filter.name = { ...filter.name, $regex: search, $options: 'i' };
    if (country) filter.country = { $regex: country, $options: 'i' };
    if (productSearch) {
      if (!filter.$and) filter.$and = [];
      filter.$and.push({
        $or: [
          { products: { $elemMatch: { $regex: productSearch, $options: 'i' } } },
          { name: { $regex: productSearch, $options: 'i' } },
        ],
      });
    }
    if (category) filter.category = category;
    if (statusFilter === 'enriched') {
      if (!filter.$and) filter.$and = [];
      filter.$and.push({ $or: [{ enrichment_status: 'done' }, { scrapedData: { $exists: true } }] });
    }
    if (statusFilter === 'not_run') { filter.enrichment_status = { $nin: ['done'] }; filter.scrapedData = { $exists: false }; }
    if (minScore) filter.lead_score = { ...(filter.lead_score || {}), $gte: parseInt(minScore) };
    if (maxScore) filter.lead_score = { ...(filter.lead_score || {}), $lte: parseInt(maxScore) };

    const buyers = await db.collection('shortlist_buyer_seller')
      .find(filter)
      .sort({ [sort]: sortDir === 'asc' ? 1 : -1 })
      .skip(parseInt(skip))
      .limit(Math.min(parseInt(limit), 200))
      .toArray();

    const total = await db.collection('shortlist_buyer_seller').countDocuments(filter);
    const enrichedCount = await db.collection('shortlist_buyer_seller').countDocuments({
      type: 'buyer',
      $or: [{ enrichment_status: 'done' }, { scrapedData: { $exists: true } }],
    });

    const result = buyers.map(b => {
      // ── New pipeline: contact_details array ──────────────────────────
      let contacts: any[] = b.contact_details || [];

      // ── Old pipeline fallback: read from scrapedData ─────────────────
      // Buyers enriched before the new pipeline have data in scrapedData.google,
      // scrapedData.apollo, and scrapedData.detailed_content[0].domain
      const sd = b.scrapedData as any;
      let legacyScraperSummary: any = null;
      let legacyDomain: string | null = null;

      if (sd) {
        const g = sd.google || {};
        const ap = sd.apollo || {};
        const gen = sd.general || {};

        // Domain from detailed_content[0] (old pipeline)
        const dc0 = (gen.detailed_content || sd.detailed_content || [])[0] || {};
        if (dc0.domain) {
          legacyDomain = (dc0.domain as string).replace(/^www\./, '');
        } else if (dc0.base_url) {
          try { legacyDomain = new URL(dc0.base_url as string).hostname.replace(/^www\./, ''); } catch { /* skip */ }
        }

        // Only add old-pipeline contacts if no new-pipeline contacts yet
        if (contacts.length === 0) {
          if (g.phone || g.address || g.website) {
            const rawWebsite = (g.website || '');
            const isBadWebsite = rawWebsite.includes('google.') || rawWebsite.includes('goo.gl');
            contacts.push({
              name: g.name || null, title: null,
              email: null, phone: g.phone || null,
              linkedin: null,
              website: isBadWebsite ? null : rawWebsite,
              address: g.address || null, source: 'google_business',
            });
          }
          if (ap.contactPersons?.length > 0) {
            for (const cp of ap.contactPersons) {
              if (cp.name || cp.email) {
                contacts.push({
                  name: cp.name || null, title: cp.title || null,
                  email: cp.email || null, phone: cp.mobile || null,
                  linkedin: cp.linkedin || null, website: null, address: null,
                  source: 'apollo',
                });
              }
            }
          }
        }

        // Always build legacyScraperSummary so dropdown shows old data
        const cleanIndustry = (gen.industry || '').replace(/[_,\s]+$/, '').trim() || null;
        const cleanDesc = (gen.description || '').replace(/[,\s]+$/, '').trim() || null;
        legacyScraperSummary = {
          google: {
            success: !!g.phone || !!g.address || !!g.website,
            results: gen.total_urls || 0,
            biz_phone: g.phone || null,
            biz_website: legacyDomain ? `https://${legacyDomain}` : (g.website && !g.website.includes('google.') ? g.website : null),
            biz_address: g.address || null,
            biz_rating: g.rating || null,
            emails_found: 0,
            phones_found: g.phone ? 1 : 0,
          },
          global: {
            success: (gen.status || '').toLowerCase().startsWith('success'),
            pages_scraped: gen.scraped || gen.websites_found || 0,
            industry: cleanIndustry,
            description: cleanDesc,
            website: gen.website || dc0.base_url || null,
            address: gen.address || null,
            emails_found: 0,
            phones_found: 0,
          },
          apollo: {
            success: ap.status === 'success',
            domain: legacyDomain,
            org_phone: ap.mobileNumber || null,
            org_linkedin: ap.linkedin_url || null,
            people: (ap.contactPersons || []).map((cp: any) => ({
              name: cp.name, title: cp.title, linkedin: cp.linkedin,
            })),
          },
        };
      }

      const emails = [...new Set(contacts.filter((c: any) => c.email).map((c: any) => c.email as string))];
      const phones = [...new Set(contacts.filter((c: any) => c.phone).map((c: any) => c.phone as string))];
      const linkedins = [...new Set(contacts.filter((c: any) => c.linkedin).map((c: any) => c.linkedin as string))];
      const seenNames = new Set<string>();
      const names = contacts
        .filter((c: any) => {
          if (!c.name || c.name === b.name) return false;
          const key = (c.name || '').toLowerCase().trim();
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        })
        .map((c: any) => ({ name: c.name, position: c.position || c.title || null, source: c.source }));

      const hasEnriched = b.enrichment_status === 'done' || (contacts.length > 0 && !!sd);
      const finalDomain = b.domain_found || legacyDomain || null;

      return {
        _id: b._id,
        name: b.name,
        country: b.country,
        category: b.category,
        totalAmount: b.totalAmount,
        transactionCount: b.transactionCount,
        lead_score: b.lead_score,
        lead_priority: b.lead_priority,
        intent_priority: b.intent_priority,
        hsCodes: b.hsCodes,
        products: b.products?.slice(0, 3),
        enriched: hasEnriched,
        enrichedAt: b.enrichment_done_at || b.lastScrapedAt || null,
        domain: finalDomain,
        emails,
        phones,
        linkedins,
        namedContacts: names,
        contact_details: contacts,
        contactCount: emails.length + phones.length + names.length,
        enrichStatus: b.enrichment_status === 'done' ? 'complete' : (sd ? 'complete' : (b.enrichment_status || 'not_run')),
        scraperSummary: mergeScraperSummaries(b.enrichment_steps_summary, legacyScraperSummary),
        buyer_notes: b.buyer_notes || '',
      };
    });

    const filtered = hasContact === 'true' ? result.filter(r => r.contactCount > 0)
      : hasContact === 'false' ? result.filter(r => r.contactCount === 0)
      : result;

    res.json({ buyers: filtered, total, enrichedCount });
  } catch (err: any) {
    logger.error('Buyers list failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// GET /api/buyers/stats
router.get('/stats', async (_req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const [totalBuyers, totalEnriched, withEmails, withPhones, topCountries] = await Promise.all([
      db.collection('shortlist_buyer_seller').countDocuments({ type: 'buyer' }),
      db.collection('enriched_contacts').countDocuments(),
      db.collection('enriched_contacts').countDocuments({ 'contacts_found.email': { $exists: true, $ne: null } }),
      db.collection('enriched_contacts').countDocuments({ 'contacts_found.phone': { $exists: true, $ne: null } }),
      db.collection('shortlist_buyer_seller').aggregate([
        { $match: { type: 'buyer' } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).toArray(),
    ]);

    res.json({ totalBuyers, totalEnriched, withEmails, withPhones, topCountries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// PATCH /api/buyers/:id/contacts — manually add/update contact details
router.patch('/:id/contacts', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const { contacts } = req.body as { contacts: any[] };
    if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts must be an array' }) as any;

    // Sanitise each contact entry
    const cleaned = contacts
      .filter(c => c.email || c.phone || c.name || c.linkedin)
      .map(c => ({
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        name: c.name?.trim() || null,
        position: c.position?.trim() || null,
        linkedin: c.linkedin?.trim() || null,
        source: c.source || 'manual',
        human_verified: c.human_verified === true,
        human_verified_at: c.human_verified === true ? (c.human_verified_at || new Date().toISOString()) : null,
      }));

    const allEmails = [...new Set(cleaned.filter(c => c.email).map(c => c.email as string))];
    const allPhones = [...new Set(cleaned.filter(c => c.phone).map(c => c.phone as string))];
    const allLinkedins = [...new Set(cleaned.filter(c => c.linkedin).map(c => c.linkedin as string))];

    let filter: any;
    try { filter = { _id: new (require('mongodb').ObjectId)(req.params.id) }; }
    catch { filter = { name: req.params.id }; }

    await db.collection('shortlist_buyer_seller').updateOne(filter, {
      $set: {
        contact_details: cleaned,
        primary_email: allEmails[0] || null,
        all_emails: allEmails,
        all_phones: allPhones,
        all_linkedins: allLinkedins,
        enrichment_status: 'done',
        enrichment_done_at: new Date(),
      },
    });

    res.json({ ok: true, saved: cleaned.length });
  } catch (err: any) {
    logger.error('Save contacts failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// PATCH /api/buyers/:id/scraper — manually edit scraper results
router.patch('/:id/scraper', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const { google, global: globalData, apollo } = req.body as {
      google?: { biz_phone?: string; biz_website?: string; biz_address?: string; biz_rating?: string };
      global?: { website?: string; address?: string; industry?: string; description?: string };
      apollo?: { domain?: string; org_phone?: string; org_linkedin?: string; people?: any[] };
    };

    let filter: any;
    try { filter = { _id: new ObjectId(req.params.id) }; }
    catch { filter = { name: req.params.id }; }

    const buyer = await db.collection('shortlist_buyer_seller').findOne(filter);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' }) as any;

    const existing = buyer.enrichment_steps_summary || {};
    const updated: any = { ...existing };

    if (google) {
      updated.google = {
        ...(existing.google || {}),
        biz_phone: google.biz_phone?.trim() || existing.google?.biz_phone || null,
        biz_website: google.biz_website?.trim() || existing.google?.biz_website || null,
        biz_address: google.biz_address?.trim() || existing.google?.biz_address || null,
        biz_rating: google.biz_rating?.trim() || existing.google?.biz_rating || null,
      };
    }

    if (globalData) {
      updated.global = {
        ...(existing.global || {}),
        website: globalData.website?.trim() || existing.global?.website || null,
        address: globalData.address?.trim() || existing.global?.address || null,
        industry: globalData.industry?.trim() || existing.global?.industry || null,
        description: globalData.description?.trim() || existing.global?.description || null,
      };
    }

    if (apollo) {
      updated.apollo = {
        ...(existing.apollo || {}),
        domain: apollo.domain?.trim() || existing.apollo?.domain || null,
        org_phone: apollo.org_phone?.trim() || existing.apollo?.org_phone || null,
        org_linkedin: apollo.org_linkedin?.trim() || existing.apollo?.org_linkedin || null,
      };
      if (Array.isArray(apollo.people)) {
        updated.apollo.people = apollo.people.filter(p => p.name || p.title || p.linkedin).map(p => ({
          name: p.name?.trim() || null,
          title: p.title?.trim() || null,
          linkedin: p.linkedin?.trim() || null,
        }));
      }
    }

    const domainToSet = updated.apollo?.domain || updated.google?.biz_website || updated.global?.website || buyer.domain_found;
    let cleanDomain = domainToSet;
    if (cleanDomain) {
      try { cleanDomain = new URL(cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`).hostname.replace(/^www\./, ''); } catch { /* keep as-is */ }
    }

    await db.collection('shortlist_buyer_seller').updateOne(filter, {
      $set: {
        enrichment_steps_summary: updated,
        ...(cleanDomain ? { domain_found: cleanDomain } : {}),
        scraper_edited_at: new Date(),
      },
    });

    const summary = mergeScraperSummaries(updated, buyer.scrapedData ? {
      google: buyer.scrapedData.google || {},
      global: buyer.scrapedData.global || {},
      apollo: buyer.scrapedData.apollo || {},
    } : null);

    res.json({ ok: true, scraperSummary: summary });
  } catch (err: any) {
    logger.error('Save scraper data failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// PATCH /api/buyers/:id/notes — save a note for this buyer
router.patch('/:id/notes', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    const { notes } = req.body as { notes: string };
    if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' }) as any;

    let filter: any;
    try { filter = { _id: new (require('mongodb').ObjectId)(req.params.id) }; }
    catch { filter = { name: req.params.id }; }

    await db.collection('shortlist_buyer_seller').updateOne(filter, {
      $set: { buyer_notes: notes.trim(), buyer_notes_updated_at: new Date() },
    });

    res.json({ ok: true });
  } catch (err: any) {
    logger.error('Save notes failed', { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

// GET /api/buyers/:id — single buyer with enriched contact details
router.get('/:id', async (req: Request, res: Response) => {
  const { client, db } = await getDhruval();
  try {
    let buyer: any = null;
    try {
      buyer = await db.collection('shortlist_buyer_seller').findOne({ _id: new ObjectId(req.params.id) });
    } catch {
      buyer = await db.collection('shortlist_buyer_seller').findOne({ name: req.params.id });
    }
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' }) as any;

    // Return the full buyer doc (which now includes contact_details and enrichment_steps_summary)
    res.json({ buyer, enriched: null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
});

export default router;
