import { QdrantClientService, QdrantSearchResult } from './qdrant.client';
import { getBuyerDb } from '../../config/mongodb';
import { getRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import type { BuyerProfile } from '../../types';

export interface BuyerIntelQuery {
  query: string;
  filters?: {
    country?: string;
    tier?: 'standard' | 'premium' | 'top';
    minShipments?: number;
  };
  limit?: number;
}

export interface ProductMatchQuery {
  productDescription: string;
  hsCode?: string;
  category?: string;
  limit?: number;
}

export interface ComplianceQuery {
  hsCode: string;
  country: string;
}

export interface BuyerLookupQuery {
  companyName: string;
  country: string;
}

export interface SearchResult<T> {
  data: T[];
  scores: number[];
  cached: boolean;
  source: 'qdrant' | 'mongodb' | 'cache';
  queryTime: number;
}

export interface BuyerIntelResult {
  profile: BuyerProfile;
  score: number;
  source: 'qdrant' | 'mongodb';
}

export interface ProductMatchResult {
  products: Array<{
    productName: string;
    hsCode: string;
    category: string;
    score: number;
  }>;
  buyers: Array<{
    profile: BuyerProfile;
    relevance: number;
    tradeStats: {
      volume: number;
      frequency: string;
    };
  }>;
}

export interface ComplianceResult {
  regulations: Array<{
    hsCode: string;
    country: string;
    regulationType: string;
    requirements: string;
    confidence: number;
    matchType: 'exact' | 'fuzzy';
  }>;
}

export interface BuyerLookupResult {
  profile: BuyerProfile | null;
  confidence: number;
  source: 'mongodb' | 'qdrant';
  alternatives?: Array<{
    profile: BuyerProfile;
    score: number;
  }>;
}

/**
 * RAG Retrieval Service
 * Provides intelligent search across buyer profiles, products, and customs data
 * using hybrid search (vector + payload filters) with MongoDB enrichment and Redis caching.
 */
export class RetrievalService {
  private qdrantClient: QdrantClientService;
  private redis: ReturnType<typeof getRedis>;

  constructor() {
    this.qdrantClient = new QdrantClientService();
    this.redis = getRedis();
  }

  /**
   * Get buyer intelligence using hybrid search
   * Combines vector similarity with payload filters
   */
  async getBuyerIntelligence(query: BuyerIntelQuery): Promise<SearchResult<BuyerIntelResult>> {
    const startTime = Date.now();
    const { query: searchQuery, filters = {}, limit = 10 } = query;

    logger.info('Buyer intelligence query', { query: searchQuery, filters, limit });

    try {
      // TODO: Generate query embedding (requires embedding endpoint or model)
      // For now, we'll use MongoDB text search as fallback
      const db = getBuyerDb();
      const collection = db.collection('buyer_profiles');

      const mongoFilter: Record<string, unknown> = {};
      if (filters.country) mongoFilter.country = filters.country;
      if (filters.tier) mongoFilter.tier = filters.tier;
      if (filters.minShipments) {
        mongoFilter['tradeStats.totalShipments'] = { $gte: filters.minShipments };
      }

      // Text search
      if (searchQuery) {
        mongoFilter.$text = { $search: searchQuery };
      }

      const results = await collection
        .find(mongoFilter)
        .limit(limit)
        .toArray();

      const data: BuyerIntelResult[] = results.map((profile) => ({
        profile: profile as BuyerProfile,
        score: 1.0, // Placeholder until vector search is implemented
        source: 'mongodb' as const,
      }));

      const queryTime = Date.now() - startTime;

      logger.info('Buyer intelligence query completed', {
        resultsCount: data.length,
        queryTime,
      });

      return {
        data,
        scores: data.map((r) => r.score),
        cached: false,
        source: 'mongodb',
        queryTime,
      };
    } catch (err: any) {
      logger.error('Buyer intelligence query failed', {
        error: err.message,
        query: searchQuery,
      });
      throw err;
    }
  }

  /**
   * Get matching products and related buyers
   */
  async getMatchingProducts(query: ProductMatchQuery): Promise<SearchResult<ProductMatchResult>> {
    const startTime = Date.now();
    const { productDescription, hsCode, category, limit = 10 } = query;

    logger.info('Product match query', { productDescription, hsCode, category, limit });

    try {
      // Placeholder implementation
      // TODO: Implement vector search on products collection
      // TODO: Find buyers who imported matching products

      const queryTime = Date.now() - startTime;

      return {
        data: [],
        scores: [],
        cached: false,
        source: 'qdrant',
        queryTime,
      };
    } catch (err: any) {
      logger.error('Product match query failed', {
        error: err.message,
        productDescription,
      });
      throw err;
    }
  }

  /**
   * Get compliance data with exact + fuzzy search
   */
  async getComplianceData(query: ComplianceQuery): Promise<SearchResult<ComplianceResult>> {
    const startTime = Date.now();
    const { hsCode, country } = query;

    logger.info('Compliance query', { hsCode, country });

    // Check cache first (24-hour TTL)
    const cacheKey = `compliance:${hsCode}:${country}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Compliance data served from cache', { hsCode, country });
        return {
          data: [JSON.parse(cached)],
          scores: [1.0],
          cached: true,
          source: 'cache',
          queryTime: Date.now() - startTime,
        };
      }
    } catch (err: any) {
      logger.warn('Cache read failed', { error: err.message });
    }

    try {
      // Placeholder implementation
      // TODO: Implement exact + fuzzy search on customs collection

      const result: ComplianceResult = {
        regulations: [],
      };

      // Cache the result (24 hours)
      try {
        await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
      } catch (err: any) {
        logger.warn('Cache write failed', { error: err.message });
      }

      const queryTime = Date.now() - startTime;

      return {
        data: [result],
        scores: [1.0],
        cached: false,
        source: 'qdrant',
        queryTime,
      };
    } catch (err: any) {
      logger.error('Compliance query failed', {
        error: err.message,
        hsCode,
        country,
      });
      throw err;
    }
  }

  /**
   * Get buyer profile by name and country
   * MongoDB first, Qdrant fallback
   */
  async getBuyerProfile(query: BuyerLookupQuery): Promise<SearchResult<BuyerLookupResult>> {
    const startTime = Date.now();
    const { companyName, country } = query;

    logger.info('Buyer lookup query', { companyName, country });

    // Check cache first (1-hour TTL)
    const cacheKey = `buyer:${companyName}:${country}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Buyer profile served from cache', { companyName, country });
        return {
          data: [JSON.parse(cached)],
          scores: [1.0],
          cached: true,
          source: 'cache',
          queryTime: Date.now() - startTime,
        };
      }
    } catch (err: any) {
      logger.warn('Cache read failed', { error: err.message });
    }

    try {
      // Try MongoDB first (exact match)
      const db = getBuyerDb();
      const collection = db.collection('buyer_profiles');

      const profile = await collection.findOne({
        companyName: { $regex: new RegExp(`^${companyName}$`, 'i') },
        country,
      });

      if (profile) {
        const result: BuyerLookupResult = {
          profile: profile as BuyerProfile,
          confidence: 1.0,
          source: 'mongodb',
        };

        // Cache the result (1 hour)
        try {
          await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
        } catch (err: any) {
          logger.warn('Cache write failed', { error: err.message });
        }

        const queryTime = Date.now() - startTime;

        logger.info('Buyer profile found in MongoDB', { companyName, country });

        return {
          data: [result],
          scores: [1.0],
          cached: false,
          source: 'mongodb',
          queryTime,
        };
      }

      // Fallback to Qdrant vector search
      // TODO: Implement vector search fallback

      logger.info('Buyer profile not found', { companyName, country });

      const queryTime = Date.now() - startTime;

      return {
        data: [
          {
            profile: null,
            confidence: 0.0,
            source: 'mongodb',
          },
        ],
        scores: [0.0],
        cached: false,
        source: 'mongodb',
        queryTime,
      };
    } catch (err: any) {
      logger.error('Buyer lookup failed', {
        error: err.message,
        companyName,
        country,
      });
      throw err;
    }
  }
}
