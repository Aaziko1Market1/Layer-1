import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from './env';
import { logger } from './logger';

let qdrantClient: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (qdrantClient) return qdrantClient;

  qdrantClient = new QdrantClient({ url: env.QDRANT_URL });
  logger.info('Qdrant client initialized', { url: env.QDRANT_URL });

  return qdrantClient;
}

export async function healthCheckQdrant(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    await client.getCollections();
    return true;
  } catch (err: any) {
    logger.error('Qdrant health check failed', { error: err.message });
    return false;
  }
}

/**
 * Initialize Qdrant collections for RAG engine.
 * Creates three collections: buyers, products, customs
 * Each with 1024-dimensional vectors (BGE-M3) and payload schemas.
 * Idempotent: safe to call multiple times.
 */
export async function initializeQdrantCollections(): Promise<void> {
  const client = getQdrantClient();
  
  try {
    const { collections } = await client.getCollections();
    const existingNames = new Set(collections.map((c) => c.name));

    // Buyers collection
    if (!existingNames.has('buyers')) {
      await client.createCollection('buyers', {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
      });
      
      // Create payload indexes for filtering
      await client.createPayloadIndex('buyers', {
        field_name: 'companyName',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('buyers', {
        field_name: 'country',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('buyers', {
        field_name: 'tier',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('buyers', {
        field_name: 'status',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('buyers', {
        field_name: 'domain',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('buyers', {
        field_name: 'totalShipments',
        field_schema: 'integer',
      });
      
      logger.info('Created Qdrant collection: buyers');
    } else {
      logger.info('Qdrant collection already exists: buyers');
    }

    // Products collection
    if (!existingNames.has('products')) {
      await client.createCollection('products', {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
      });
      
      await client.createPayloadIndex('products', {
        field_name: 'productName',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('products', {
        field_name: 'hsCode',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('products', {
        field_name: 'category',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('products', {
        field_name: 'description',
        field_schema: 'text',
      });
      
      logger.info('Created Qdrant collection: products');
    } else {
      logger.info('Qdrant collection already exists: products');
    }

    // Customs collection
    if (!existingNames.has('customs')) {
      await client.createCollection('customs', {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
      });
      
      await client.createPayloadIndex('customs', {
        field_name: 'hsCode',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('customs', {
        field_name: 'country',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('customs', {
        field_name: 'regulationType',
        field_schema: 'keyword',
      });
      await client.createPayloadIndex('customs', {
        field_name: 'complianceLevel',
        field_schema: 'keyword',
      });
      
      logger.info('Created Qdrant collection: customs');
    } else {
      logger.info('Qdrant collection already exists: customs');
    }

    logger.info('Qdrant collections initialized successfully');
  } catch (err: any) {
    logger.error('Failed to initialize Qdrant collections', { error: err.message, stack: err.stack });
    throw new Error(`Qdrant initialization failed: ${err.message}`);
  }
}

/**
 * Verify that all required collections exist with correct configuration.
 */
export async function verifyQdrantCollections(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    const { collections } = await client.getCollections();
    const existingNames = new Set(collections.map((c) => c.name));

    const required = ['buyers', 'products', 'customs'];
    const missing = required.filter((name) => !existingNames.has(name));

    if (missing.length > 0) {
      logger.error('Missing Qdrant collections', { missing });
      return false;
    }

    // Verify vector dimensions
    for (const name of required) {
      const info = await client.getCollection(name);
      if (info.config?.params?.vectors && typeof info.config.params.vectors === 'object' && 'size' in info.config.params.vectors) {
        const size = info.config.params.vectors.size;
        if (size !== 1024) {
          logger.error('Invalid vector dimension', { collection: name, expected: 1024, actual: size });
          return false;
        }
      }
    }

    logger.info('Qdrant collections verified successfully');
    return true;
  } catch (err: any) {
    logger.error('Qdrant verification failed', { error: err.message });
    return false;
  }
}
