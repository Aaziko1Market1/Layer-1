import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// Try multiple .env locations
const envPaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'TT/.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.warn('⚠️  No .env file found, using environment variables');
}

const envSchema = z.object({
  // Infrastructure
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  QDRANT_URL: z.string().default('http://127.0.0.1:6333'),

  // AI: Standard tier (DeepInfra / OpenAI-compatible)
  QWEN_8B_ENDPOINT: z.string().default('https://api.deepinfra.com/v1/openai'),
  QWEN_8B_API_KEY: z.string().default(''),

  // AI: Qwen3-32B (SiliconFlow)
  QWEN_32B_API_KEY: z.string().default(''),
  QWEN_32B_ENDPOINT: z.string().default('https://api.siliconflow.cn/v1'),

  // AI: Qwen3-235B-A22B (SiliconFlow)
  QWEN_235B_API_KEY: z.string().default(''),
  QWEN_235B_ENDPOINT: z.string().default('https://api.siliconflow.cn/v1'),

  // Search API (Serper.dev — free Google Search API)
  SERPER_API_KEY: z.string().default(''),

  // Global scraper internal URL (Docker network direct IP avoids DNS flakiness)
  GLOBAL_SCRAPER_URL: z.string().default('http://aaziko.global.43.249.231.93.sslip.io'),

  // Webshare rotating proxies
  WEBSHARE_API_KEY: z.string().default(''),

  // Enrichment APIs
  APOLLO_API_KEY: z.string().default(''),
  HUNTER_API_KEY: z.string().default(''),
  SNOV_CLIENT_ID: z.string().default(''),
  SNOV_CLIENT_SECRET: z.string().default(''),
  ZEROBOUNCE_API_KEY: z.string().default(''),
  BRAVE_SEARCH_API_KEY: z.string().default(''),

  // Operational Limits
  DAILY_RESEARCH_LIMIT: z.coerce.number().default(5000),
  QA_SAMPLE_RATE: z.coerce.number().default(0.05),
  WEBSITE_TRUST_THRESHOLD: z.coerce.number().default(60),
  MIN_CONTACT_CONFIDENCE: z.coerce.number().default(50),

  // Server
  PORT: z.coerce.number().default(4400),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  console.error('Tried .env paths:', envPaths);
  console.error('MONGODB_URI from process.env:', process.env.MONGODB_URI ? 'exists' : 'missing');
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
