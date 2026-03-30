import { logger } from '../../config/logger';
import { getBuyerDb } from '../../config/mongodb';
import { WebsiteDiscoveryService } from '../verification/website-discovery.service';
import { WebsiteTrustService } from '../verification/website-trust.service';
import { WebsiteExtractorService } from '../verification/website-extractor.service';
import { SubsidiaryDetectorService } from '../verification/subsidiary-detector.service';
import type { BuyerProfile, WebsiteTrustReport, TrustInput } from '../../types';

export interface VerifierOptions {
  limit?: number;
  batchSize?: number;
}

/**
 * STEP 3: Website Verification
 * Takes classified buyer profiles and verifies their websites using:
 * - Website discovery (5 sources)
 * - Trust scoring (6 checks)
 * Updates status: classified → verified
 */
export async function verifyWebsites(
  options: VerifierOptions = {}
): Promise<{ verified: number; failed: number; skipped: number }> {
  const { limit = 100, batchSize = 3 } = options;
  
  const db = getBuyerDb();
  const discoveryService = new WebsiteDiscoveryService();
  const trustService = new WebsiteTrustService();
  const extractorService = new WebsiteExtractorService();
  const subsidiaryDetector = new SubsidiaryDetectorService();
  
  logger.info('=== Website Verification Starting ===', { limit, batchSize });
  
  // Find classified profiles that need verification
  const profiles = await db
    .collection<BuyerProfile>('buyer_profiles')
    .find({ status: 'classified' })
    .sort({ score: -1 }) // Highest quality first
    .limit(limit)
    .toArray();
  
  if (profiles.length === 0) {
    logger.info('No profiles to verify');
    return { verified: 0, failed: 0, skipped: 0 };
  }
  
  logger.info('Found profiles to verify', { count: profiles.length });
  
  let verified = 0;
  let failed = 0;
  let skipped = 0;
  
  // Process in batches to avoid overwhelming external APIs
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    
    for (const profile of batch) {
      try {
        logger.info('Verifying website', {
          buyer: profile.companyName,
          country: profile.country,
        });
        
        // Step 1: Discover candidate websites
        const discoveryResult = await discoveryService.discoverWebsites({
          companyName: profile.companyName,
          country: profile.country,
          hsCodes: profile.hsCodes,
          tradeEmails: [], // TODO: Extract from trade data if available
        });
        
        if (discoveryResult.candidatesFound === 0) {
          logger.warn('No website candidates found', {
            buyer: profile.companyName,
          });
          
          // Update profile with no website found
          await db.collection('buyer_profiles').updateOne(
            { _id: profile._id },
            {
              $set: {
                websiteTrust: null,
                verifiedWebsite: null,
                domain: null,
                websiteVerifiedAt: new Date(),
                status: 'website_verified', // Intermediate status before agent pipeline
                updatedAt: new Date(),
              },
            }
          );
          
          skipped++;
          continue;
        }
        
        // Step 2: Score the best candidate
        const bestCandidate = discoveryResult.bestMatch!;
        
        const trustInput: TrustInput = {
          companyName: profile.companyName,
          country: profile.country,
          hsCodes: profile.hsCodes,
          apolloDomain: discoveryResult.candidates.find(c => c.source === 'apollo')?.domain,
          hunterDomain: discoveryResult.candidates.find(c => c.source === 'hunter')?.domain,
          tradeDataDomains: discoveryResult.candidates
            .filter(c => c.source === 'trade_data')
            .map(c => c.domain),
        };
        
        const trustScore = await trustService.calculateTrustScore(
          bestCandidate,
          trustInput
        );
        
        // Step 3: Extract data from trusted website (trust >= 50 only)
        const extractedData = await extractorService.extract(
          bestCandidate.domain,
          trustScore.totalScore
        );

        // Step 4: Detect subsidiary using company name + scraped text
        const websiteText = extractedData?.companyDescription || null;
        const subsidiary = await subsidiaryDetector.detect(
          profile.companyName,
          websiteText
        );

        // Step 5: Build trust report
        const trustReport: WebsiteTrustReport = {
          candidatesFound: discoveryResult.candidatesFound,
          selectedDomain: bestCandidate.domain,
          trustScore: trustScore.totalScore,
          trustBand: trustScore.trustBand,
          checks: trustScore.checks,
          subsidiary,
          extractedData,
          verifiedAt: new Date(),
          errors: [],
        };
        
        // Step 4: Update profile
        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              websiteTrust: trustReport,
              verifiedWebsite: trustScore.trustBand !== 'rejected' ? bestCandidate.url : null,
              domain: bestCandidate.domain, // Save domain so contact discovery can use it
              websiteVerifiedAt: new Date(),
              status: 'website_verified', // Intermediate status before agent pipeline
              updatedAt: new Date(),
            },
          }
        );
        
        logger.info('Website verified', {
          buyer: profile.companyName,
          domain: bestCandidate.domain,
          trustScore: trustScore.totalScore,
          trustBand: trustScore.trustBand,
        });
        
        verified++;
      } catch (err: any) {
        logger.error('Website verification failed', {
          buyer: profile.companyName,
          error: err.message,
        });
        
        // Mark as verified with error (don't block pipeline)
        await db.collection('buyer_profiles').updateOne(
          { _id: profile._id },
          {
            $set: {
              websiteTrust: null,
              verifiedWebsite: null,
              domain: null,
              websiteVerifiedAt: new Date(),
              status: 'website_verified',
              updatedAt: new Date(),
            },
          }
        );

        failed++;
      }
    }
    
    // Progress logging
    if ((i + batchSize) % 10 === 0 || i + batchSize >= profiles.length) {
      logger.info('Verification progress', {
        verified,
        failed,
        skipped,
        total: profiles.length,
      });
    }
    
    // Delay between batches (2 seconds to respect API rate limits)
    if (i + batchSize < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Create audit log
  await db.collection('audit_log').insertOne({
    action: 'etl_verify',
    entityType: 'etl_run',
    entityId: `verify_${Date.now()}`,
    details: { verified, failed, skipped, limit },
    createdAt: new Date(),
  });
  
  logger.info('=== Website Verification Complete ===', {
    verified,
    failed,
    skipped,
  });
  
  return { verified, failed, skipped };
}
