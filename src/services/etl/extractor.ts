import { getTradeDb, getBuyerDb } from '../../config/mongodb';
import { logger } from '../../config/logger';
import type { BuyerProfile } from '../../types';

/**
 * Extract unique importers from standard_port_data.
 * Only extracts: company name + country.
 * All other data comes from the enrichment steps.
 */
export async function extractImporters(options: {
  country?: string;
  limit?: number;
  skipExisting?: boolean;
}): Promise<{ extracted: number; skipped: number }> {
  const tradeDb = getTradeDb();
  const buyerDb = getBuyerDb();
  const { country, limit = 1000, skipExisting = true } = options;

  logger.info('Starting importer extraction', { country, limit, skipExisting });

  // Skip placeholder names
  const matchStage: Record<string, unknown> = {
    IMPORTER_NAME: { 
      $exists: true, 
      $nin: [
        '', null, 
        'TO ORDER', 'TO THE ORDER', 'TO THE ORDER OF',
        'TO THE', 'ORDER', 'UNKNOWN', 'N/A', 'NOT AVAILABLE', '-', '.'
      ],
      $not: { $regex: /^to\s+(the\s+)?(order(\s+of)?)?$/i }
    },
  };
  if (country) matchStage.IMPORT_COUNTRY = country;

  // Aggregate trade stats alongside company extraction
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: { $toLower: { $trim: { input: '$IMPORTER_NAME' } } },
        companyName: { $first: '$IMPORTER_NAME' },
        country: { $first: { $ifNull: ['$IMPORT_COUNTRY', '$COUNTRY_CODE'] } },
        totalShipments: { $sum: 1 },
        totalValue: { $sum: { $ifNull: ['$TOTAL_VALUE', 0] } },
        avgValue: { $avg: { $ifNull: ['$TOTAL_VALUE', 0] } },
        products: { $addToSet: '$PRODUCT_DESCRIPTION' },
        hsCodes: { $addToSet: '$HS_CODE' },
        firstDate: { $min: '$DATE' },
        lastDate: { $max: '$DATE' },
        originCountries: { $addToSet: '$ORIGIN_COUNTRY' },
        ports: { $addToSet: '$PORT' },
      },
    },
    { $match: { totalShipments: { $gte: 2 } } },
    { $sort: { totalShipments: -1 as const } },
    { $limit: limit },
  ];

  const cursor = tradeDb.collection('standard_port_data').aggregate(pipeline, { allowDiskUse: true });

  let extracted = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const normalizedName = (doc._id as string).toLowerCase().trim();
    
    // Skip placeholder names
    const skipPatterns = [
      /^to\s+order$/, /^to\s+the\s+order$/, /^to\s+the\s+order\s+of$/,
      /^to\s+the$/, /^order$/, /^unknown$/, /^n\/?a$/,
      /^not\s+available$/, /^-+$/, /^\.+$/,
    ];
    if (skipPatterns.some(p => p.test(normalizedName))) {
      skipped++;
      continue;
    }

    if (skipExisting) {
      const existing = await buyerDb.collection('buyer_profiles').findOne({ normalizedName });
      if (existing) { skipped++; continue; }
    }

    const now = new Date();
    const companyName = doc.companyName?.trim() || normalizedName;
    const companyCountry = doc.country || 'UNKNOWN';

    // Build trade stats from aggregated data
    const totalShipments = doc.totalShipments || 0;
    const totalValue = doc.totalValue || 0;
    const products = (doc.products || []).filter(Boolean).slice(0, 50);
    const hsCodes = (doc.hsCodes || []).filter(Boolean).map(String).slice(0, 20);
    const firstDate = doc.firstDate ? new Date(doc.firstDate) : now;
    const lastDate = doc.lastDate ? new Date(doc.lastDate) : now;

    // Determine frequency from date range and shipment count
    const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    const shipmentsPerMonth = (totalShipments / daySpan) * 30;
    const frequency = shipmentsPerMonth >= 4 ? 'weekly' : shipmentsPerMonth >= 1 ? 'monthly' : shipmentsPerMonth >= 0.3 ? 'quarterly' : 'sporadic';

    // Determine tier from trade value
    const tier = totalValue >= 1_000_000 ? 'top' : totalValue >= 100_000 ? 'premium' : 'standard';

    const topOriginCountries = (doc.originCountries || []).filter(Boolean).slice(0, 5).map((c: string) => ({ country: c, count: 1 }));
    const topPorts = (doc.ports || []).filter(Boolean).slice(0, 5).map((p: string) => ({ port: p, count: 1 }));

    const profile: BuyerProfile = {
      companyName,
      normalizedName,
      domain: null,
      country: companyCountry,
      tier,
      industry: null,
      subIndustry: null,
      products,
      hsCodes,
      tradeStats: {
        totalShipments,
        totalValue,
        avgShipmentValue: totalShipments > 0 ? totalValue / totalShipments : 0,
        topOriginCountries,
        topPorts,
        dateRange: { first: firstDate, last: lastDate },
        frequency: frequency as any,
      },
      contacts: [],
      enrichment: { apollo: null, hunter: null, snov: null, brave: null },
      aiAnalysis: { classification: null, buyingPatterns: null, recommendedApproach: null, model: null, analyzedAt: null },
      status: 'extracted',
      score: 0,
      createdAt: now,
      updatedAt: now,
    };

    await buyerDb.collection('buyer_profiles').insertOne(profile);
    extracted++;

    // Store extraction step data — only company name + country
    await buyerDb.collection('buyer_profiles').updateOne(
      { normalizedName },
      {
        $set: {
          'step_data.extraction': {
            step_name: 'ETL Step 1: Extraction',
            data: { company_name: companyName, country: companyCountry },
            received_at: new Date(),
          },
        },
      }
    );

    if (extracted % 100 === 0) {
      logger.info('Extraction progress', { extracted, skipped });
    }
  }

  logger.info('Extraction complete', { extracted, skipped });

  await buyerDb.collection('audit_log').insertOne({
    action: 'etl_extract',
    entityType: 'etl_run',
    entityId: `extract_${Date.now()}`,
    details: { extracted, skipped, country, limit },
    createdAt: new Date(),
  });

  return { extracted, skipped };
}
