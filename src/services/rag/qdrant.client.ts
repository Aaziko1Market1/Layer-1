import { getQdrantClient } from '../../config/qdrant';
import { logger } from '../../config/logger';

export interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface HybridSearchOptions {
  vector: number[];
  filters?: Record<string, unknown>;
  limit?: number;
  scoreThreshold?: number;
}

export interface ExactSearchOptions {
  filters: Record<string, unknown>;
  limit?: number;
}

/**
 * Qdrant client wrapper for RAG operations.
 * Provides hybrid search (vector + payload filters) and exact search.
 */
export class QdrantClientService {
  /**
   * Perform hybrid search: vector similarity + payload filtering
   */
  async hybridSearch(
    collection: 'buyers' | 'products' | 'customs',
    options: HybridSearchOptions
  ): Promise<QdrantSearchResult[]> {
    const client = getQdrantClient();
    const { vector, filters, limit = 10, scoreThreshold = 0.0 } = options;

    try {
      const filter = filters ? this.buildFilter(filters) : undefined;

      const results = await client.search(collection, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter,
        with_payload: true,
      });

      logger.info('Qdrant hybrid search completed', {
        collection,
        resultsCount: results.length,
        hasFilters: !!filters,
      });

      return results.map((r) => ({
        id: String(r.id),
        score: r.score,
        payload: r.payload || {},
      }));
    } catch (err: any) {
      logger.error('Qdrant hybrid search failed', {
        collection,
        error: err.message,
        filters,
      });
      throw err;
    }
  }

  /**
   * Perform exact search using only payload filters (no vector)
   */
  async exactSearch(
    collection: 'buyers' | 'products' | 'customs',
    options: ExactSearchOptions
  ): Promise<QdrantSearchResult[]> {
    const client = getQdrantClient();
    const { filters, limit = 10 } = options;

    try {
      const filter = this.buildFilter(filters);

      const results = await client.scroll(collection, {
        filter,
        limit,
        with_payload: true,
        with_vector: false,
      });

      logger.info('Qdrant exact search completed', {
        collection,
        resultsCount: results.points.length,
      });

      return results.points.map((r) => ({
        id: String(r.id),
        score: 1.0, // Exact match
        payload: r.payload || {},
      }));
    } catch (err: any) {
      logger.error('Qdrant exact search failed', {
        collection,
        error: err.message,
        filters,
      });
      throw err;
    }
  }

  /**
   * Build Qdrant filter from simple key-value object
   */
  private buildFilter(filters: Record<string, unknown>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && '$gte' in value) {
        // Range filter: { field: { $gte: value } }
        must.push({
          key,
          range: {
            gte: (value as any).$gte,
          },
        });
      } else if (typeof value === 'object' && '$lte' in value) {
        // Range filter: { field: { $lte: value } }
        must.push({
          key,
          range: {
            lte: (value as any).$lte,
          },
        });
      } else {
        // Exact match
        must.push({
          key,
          match: { value },
        });
      }
    }

    return must.length > 0 ? { must } : {};
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = getQdrantClient();
      await client.getCollections();
      return true;
    } catch {
      return false;
    }
  }
}
