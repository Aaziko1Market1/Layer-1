/**
 * Global singleton tracking Serper.dev API credit status.
 * When credits run out the enrichment pauses and the UI shows
 * a banner asking the user to add a new key or wait for reset.
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../config/logger';

export interface SerperStatus {
  paused: boolean;
  pausedAt: Date | null;
  reason: string;
  creditsExhausted: boolean;
}

export const serperStatus: SerperStatus = {
  paused: false,
  pausedAt: null,
  reason: '',
  creditsExhausted: false,
};

export function markSerperExhausted() {
  if (serperStatus.creditsExhausted) return; // already set
  serperStatus.paused = true;
  serperStatus.pausedAt = new Date();
  serperStatus.reason = 'Serper.dev API credits exhausted. Add a new API key to resume.';
  serperStatus.creditsExhausted = true;
  logger.warn('🔑 Serper.dev credits exhausted — enrichment paused. Add new key to resume.');
}

export function clearSerperPause() {
  serperStatus.paused = false;
  serperStatus.pausedAt = null;
  serperStatus.reason = '';
  serperStatus.creditsExhausted = false;
}

/**
 * Write the new SERPER_API_KEY value into the .env file on disk
 * so it survives restarts. Also updates process.env immediately.
 */
export function persistSerperKey(newKey: string): void {
  process.env.SERPER_API_KEY = newKey;

  const envPaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'TT/.env'),
  ];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    try {
      let content = fs.readFileSync(envPath, 'utf-8');
      if (/^SERPER_API_KEY=.*/m.test(content)) {
        content = content.replace(/^SERPER_API_KEY=.*/m, `SERPER_API_KEY=${newKey}`);
      } else {
        content += `\nSERPER_API_KEY=${newKey}\n`;
      }
      fs.writeFileSync(envPath, content, 'utf-8');
      logger.info(`✅ SERPER_API_KEY updated in ${envPath}`);
      break;
    } catch (e: any) {
      logger.warn(`Could not write .env at ${envPath}: ${e.message}`);
    }
  }
}
