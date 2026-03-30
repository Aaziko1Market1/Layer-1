import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const client = axios.create({
  baseURL: 'https://api.zerobounce.net/v2',
  timeout: 30_000,
});

export interface EmailValidation {
  email: string;
  valid: boolean;
  status: string;
  subStatus: string;
  freeEmail: boolean;
  didYouMean: string | null;
  domain: string;
  mxFound: boolean;
}

export async function verifyEmail(email: string): Promise<EmailValidation> {
  if (!env.ZEROBOUNCE_API_KEY) {
    return {
      email,
      valid: false,
      status: 'unknown',
      subStatus: 'api_key_missing',
      freeEmail: false,
      didYouMean: null,
      domain: email.split('@')[1] || '',
      mxFound: false,
    };
  }

  try {
    const res = await client.get('/validate', {
      params: { api_key: env.ZEROBOUNCE_API_KEY, email },
    });

    const d = res.data;
    return {
      email,
      valid: d.status === 'valid',
      status: d.status,
      subStatus: d.sub_status || '',
      freeEmail: d.free_email || false,
      didYouMean: d.did_you_mean || null,
      domain: d.domain || '',
      mxFound: d.mx_found === 'true',
    };
  } catch (err: any) {
    logger.error('ZeroBounce verify failed', { email, error: err.message });
    return {
      email,
      valid: false,
      status: 'error',
      subStatus: err.message,
      freeEmail: false,
      didYouMean: null,
      domain: email.split('@')[1] || '',
      mxFound: false,
    };
  }
}

export async function verifyEmailBatch(emails: string[]): Promise<EmailValidation[]> {
  // ZeroBounce batch API for efficiency
  if (!env.ZEROBOUNCE_API_KEY || emails.length === 0) return [];

  // For small batches, use individual calls
  if (emails.length <= 5) {
    return Promise.all(emails.map(verifyEmail));
  }

  try {
    const res = await client.post('/validatebatch', {
      api_key: env.ZEROBOUNCE_API_KEY,
      email_batch: emails.map((e) => ({ email_address: e })),
    });

    return (res.data.email_batch || []).map((d: any) => ({
      email: d.address,
      valid: d.status === 'valid',
      status: d.status,
      subStatus: d.sub_status || '',
      freeEmail: d.free_email || false,
      didYouMean: d.did_you_mean || null,
      domain: d.domain || '',
      mxFound: d.mx_found === 'true',
    }));
  } catch (err: any) {
    logger.error('ZeroBounce batch verify failed', { count: emails.length, error: err.message });
    return emails.map((email) => ({
      email,
      valid: false,
      status: 'error',
      subStatus: err.message,
      freeEmail: false,
      didYouMean: null,
      domain: email.split('@')[1] || '',
      mxFound: false,
    }));
  }
}
