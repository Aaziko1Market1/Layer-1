import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import { logger } from './logger';

let client: MongoClient | null = null;
let tradeDb: Db | null = null;
let buyerDb: Db | null = null;

export async function connectMongo(): Promise<{ tradeDb: Db; buyerDb: Db }> {
  if (tradeDb && buyerDb) return { tradeDb, buyerDb };

  client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });

  await client.connect();
  logger.info('MongoDB connected');

  // Trade data from common-service database (5.1M records)
  tradeDb = client.db('common-service');
  // Buyer intelligence data in aaziko_trade database
  buyerDb = client.db('aaziko_trade');

  // Ensure indexes on buyer_intelligence collections
  await buyerDb.collection('buyer_profiles').createIndexes([
    { key: { companyName: 1 }, name: 'idx_company' },
    { key: { domain: 1 }, name: 'idx_domain', sparse: true },
    { key: { country: 1 }, name: 'idx_country' },
    { key: { tier: 1 }, name: 'idx_tier' },
    { key: { 'tradeStats.totalShipments': -1 }, name: 'idx_shipments_desc' },
    { key: { updatedAt: -1 }, name: 'idx_updated' },
    { key: { companyName: 'text', domain: 'text', products: 'text' }, name: 'idx_text_search' },
  ]);

  await buyerDb.collection('enrichment_jobs').createIndexes([
    { key: { status: 1, createdAt: 1 }, name: 'idx_status_created' },
    { key: { buyerProfileId: 1 }, name: 'idx_buyer_profile' },
  ]);

  await buyerDb.collection('audit_log').createIndexes([
    { key: { action: 1, createdAt: -1 }, name: 'idx_action_date' },
    { key: { entityId: 1 }, name: 'idx_entity' },
  ]);

  logger.info('MongoDB indexes ensured');
  return { tradeDb, buyerDb };
}

export function getTradeDb(): Db {
  if (!tradeDb) throw new Error('Trade DB not connected. Call connectMongo() first.');
  return tradeDb;
}

export function getBuyerDb(): Db {
  if (!buyerDb) throw new Error('Buyer DB not connected. Call connectMongo() first.');
  return buyerDb;
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    tradeDb = null;
    buyerDb = null;
    logger.info('MongoDB disconnected');
  }
}
