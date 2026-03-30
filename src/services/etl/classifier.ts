import { getBuyerDb } from '../../config/mongodb';
import { logger } from '../../config/logger';
import { classifyBuyer } from '../ai/router';
import type { BuyerProfile } from '../../types';

/**
 * AI-powered classification of extracted buyer profiles.
 * Uses local Qwen3-8B for lightweight classification tasks.
 */
export async function classifyProfiles(options: {
  limit?: number;
  batchSize?: number;
}): Promise<{ classified: number; failed: number }> {
  const db = getBuyerDb();
  const { limit = 100, batchSize = 5 } = options;

  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: 'extracted' })
    .sort({ 'tradeStats.totalShipments': -1 })
    .limit(limit)
    .toArray();

  logger.info('Starting classification', { count: profiles.length });

  let classified = 0;
  let failed = 0;

  // Process in batches to avoid overwhelming Ollama
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    for (const profile of batch) {
      try {
        const response = await classifyBuyer(
          profile.companyName,
          profile.products,
          profile.country,
          profile.tradeStats.totalShipments
        );

        // Parse AI response
        let classification: Record<string, unknown> = {};
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            
            // Fix common AI JSON errors
            // 1. Fix unquoted NOT_FOUND, UNKNOWN, NULL values
            jsonStr = jsonStr.replace(/:\s*(NOT_FOUND|UNKNOWN|NULL|None|null)\s*([,}])/g, ': "$1"$2');
            
            // 2. Fix trailing commas
            jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
            
            // 3. Try to parse
            classification = JSON.parse(jsonStr);
          }
        } catch (parseError: any) {
          logger.warn('Failed to parse AI classification JSON', { 
            company: profile.companyName,
            error: parseError.message,
            rawContent: response.content.substring(0, 200)
          });
          classification = { raw: response.content };
        }

        // Update profile
        const score = computeScore(profile, classification);
        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              industry: (classification.industry as string) || null,
              subIndustry: (classification.subIndustry as string) || null,
              'aiAnalysis.classification': JSON.stringify(classification),
              'aiAnalysis.model': response.model,
              'aiAnalysis.analyzedAt': new Date(),
              'step_data.ai_classification': {
                step_name: 'ETL Step 2: AI Classification',
                data: classification,
                model: response.model,
                received_at: new Date(),
              },
              score,
              status: 'classified',
              updatedAt: new Date(),
            },
          }
        );

        classified++;
        logger.debug('Classified buyer', { company: profile.companyName, industry: classification.industry, score });
      } catch (err: any) {
        // Graceful degradation: Mark as classified even if AI fails
        const score = computeScore(profile, {});
        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              industry: null,
              subIndustry: null,
              'aiAnalysis.classification': null,
              'aiAnalysis.model': null,
              'aiAnalysis.analyzedAt': new Date(),
              score,
              status: 'classified',
              updatedAt: new Date(),
            },
          }
        );
        
        classified++; // Count as classified (with null AI data)
        logger.warn('Classification failed, using defaults', { company: profile.companyName, error: err.message });
      }
    }

    // Small delay between batches to avoid GPU overload
    if (i + batchSize < profiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.info('Classification complete', { classified, failed });

  await db.collection('audit_log').insertOne({
    action: 'etl_classify',
    entityType: 'etl_run',
    entityId: `classify_${Date.now()}`,
    details: { classified, failed, limit },
    createdAt: new Date(),
  });

  return { classified, failed };
}

function computeScore(profile: BuyerProfile, classification: Record<string, unknown>): number {
  let score = 0;

  // Shipment volume (0-30 points)
  const shipments = profile.tradeStats.totalShipments;
  if (shipments >= 100) score += 30;
  else if (shipments >= 50) score += 25;
  else if (shipments >= 20) score += 20;
  else if (shipments >= 10) score += 15;
  else if (shipments >= 5) score += 10;
  else score += 5;

  // Trade value (0-20 points)
  const value = profile.tradeStats.totalValue;
  if (value >= 1_000_000) score += 20;
  else if (value >= 500_000) score += 15;
  else if (value >= 100_000) score += 10;
  else if (value > 0) score += 5;

  // Buying frequency (0-15 points)
  if (profile.tradeStats.frequency === 'weekly') score += 15;
  else if (profile.tradeStats.frequency === 'monthly') score += 12;
  else if (profile.tradeStats.frequency === 'quarterly') score += 8;
  else score += 3;

  // Product diversity (0-10 points)
  const productCount = profile.products.length;
  if (productCount >= 10) score += 10;
  else if (productCount >= 5) score += 7;
  else score += 3;

  // AI outreach priority (0-15 points)
  const aiPriority = (classification.outreachPriority as number) || 5;
  score += Math.min(15, Math.round(aiPriority * 1.5));

  // AI confidence bonus (0-10 points)
  const confidence = (classification.confidence as number) || 0.5;
  score += Math.round(confidence * 10);

  return Math.min(100, Math.max(0, score));
}
