import { ObjectId } from 'mongodb';
import { logger } from '../../config/logger';
import { getBuyerDb } from '../../config/mongodb';
import { env } from '../../config/env';

/**
 * QA Service — Sample enriched buyers for quality assurance.
 * Auto-pauses pipeline if error rate exceeds threshold.
 */
export class QAService {
  private sampleRate: number;
  private errorThreshold = 0.15; // 15% error rate → auto-pause

  constructor() {
    this.sampleRate = env.QA_SAMPLE_RATE;
  }

  /**
   * Decide whether to sample this enriched buyer for QA.
   * Returns true if buyer should be flagged for QA review.
   */
  shouldSample(): boolean {
    return Math.random() < this.sampleRate;
  }

  /**
   * Mark a buyer as sampled for QA review.
   */
  async markForQA(enrichedBuyerId: ObjectId): Promise<void> {
    const db = getBuyerDb();
    await db.collection('enriched_buyers').updateOne(
      { _id: enrichedBuyerId },
      {
        $set: {
          pipeline_state: 'qa_pending',
          'qa.sampled': true,
          'qa.reviewed': false,
          'qa.passed': null,
          updated_at: new Date(),
        },
      }
    );
    logger.info('QA: buyer marked for review', { id: enrichedBuyerId.toString() });
  }

  /**
   * Submit QA review result.
   */
  async submitReview(
    enrichedBuyerId: ObjectId,
    passed: boolean,
    reviewer: string,
    notes?: string
  ): Promise<void> {
    const db = getBuyerDb();
    const newState = passed ? 'qa_passed' : 'qa_failed';
    await db.collection('enriched_buyers').updateOne(
      { _id: enrichedBuyerId },
      {
        $set: {
          pipeline_state: newState,
          'qa.reviewed': true,
          'qa.passed': passed,
          'qa.reviewer': reviewer,
          'qa.reviewedAt': new Date(),
          'qa.notes': notes || null,
          updated_at: new Date(),
        },
      }
    );

    // Log audit
    await db.collection('audit_log').insertOne({
      action: 'qa_review',
      entityType: 'enriched_buyer' as any,
      entityId: enrichedBuyerId.toString(),
      details: { passed, reviewer, notes: notes || null },
      createdAt: new Date(),
    });

    logger.info('QA: review submitted', { id: enrichedBuyerId.toString(), passed, reviewer });

    // Check error rate after each review
    await this.checkErrorRate();
  }

  /**
   * Check the QA error rate. If too high, auto-pause pipeline.
   */
  async checkErrorRate(): Promise<{ errorRate: number; paused: boolean }> {
    const db = getBuyerDb();
    const recentReviews = await db.collection('enriched_buyers')
      .find({ 'qa.reviewed': true })
      .sort({ 'qa.reviewedAt': -1 })
      .limit(50)
      .project({ 'qa.passed': 1 })
      .toArray();

    if (recentReviews.length < 5) return { errorRate: 0, paused: false };

    const failures = recentReviews.filter(r => r.qa?.passed === false).length;
    const errorRate = failures / recentReviews.length;

    if (errorRate > this.errorThreshold) {
      logger.error('QA: HIGH ERROR RATE — auto-pausing pipeline', {
        errorRate: (errorRate * 100).toFixed(1) + '%',
        failures,
        total: recentReviews.length,
      });

      await db.collection('audit_log').insertOne({
        action: 'qa_auto_pause',
        entityType: 'pipeline' as any,
        entityId: 'system',
        details: { errorRate, failures, total: recentReviews.length },
        createdAt: new Date(),
      });

      return { errorRate, paused: true };
    }

    return { errorRate, paused: false };
  }

  /**
   * Get QA dashboard statistics.
   */
  async getStats(): Promise<{
    pending: number;
    reviewed: number;
    passed: number;
    failed: number;
    errorRate: number;
  }> {
    const db = getBuyerDb();
    const [pending, passed, failed] = await Promise.all([
      db.collection('enriched_buyers').countDocuments({ 'qa.sampled': true, 'qa.reviewed': false }),
      db.collection('enriched_buyers').countDocuments({ 'qa.passed': true }),
      db.collection('enriched_buyers').countDocuments({ 'qa.passed': false, 'qa.reviewed': true }),
    ]);

    const reviewed = passed + failed;
    const errorRate = reviewed > 0 ? failed / reviewed : 0;

    return { pending, reviewed, passed, failed, errorRate };
  }
}
