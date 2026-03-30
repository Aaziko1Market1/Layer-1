import axios from 'axios';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

export interface ZeroBounceResult {
  email: string;
  status: 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'spamtrap' | 'abuse' | 'do_not_mail';
  sub_status: string;
  free_email: boolean;
  did_you_mean: string | null;
  account: string;
  domain: string;
  domain_age_days: string;
  smtp_provider: string;
  mx_found: string;
  mx_record: string;
  firstname: string | null;
  lastname: string | null;
  gender: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  zipcode: string | null;
  processed_at: string;
}

export interface EmailVerificationResult {
  email: string;
  verified: boolean;
  status: 'verified_safe' | 'verified_risky' | 'invalid' | 'unknown';
  confidence: number; // 0.0-1.0
  isFreeEmail: boolean;
  creditsUsed: number;
}

/**
 * ZeroBounce API Service
 * Email verification and validation
 */
export class ZeroBounceService {
  private readonly baseUrl = 'https://api.zerobounce.net/v2';
  private readonly timeout = 5000;

  /**
   * Verify email address
   */
  async verifyEmail(email: string, ipAddress?: string): Promise<EmailVerificationResult> {
    try {
      if (!env.ZEROBOUNCE_API_KEY) {
        logger.warn('ZeroBounce API key not configured');
        return {
          email,
          verified: false,
          status: 'unknown',
          confidence: 0,
          isFreeEmail: false,
          creditsUsed: 0,
        };
      }

      const response = await axios.get(`${this.baseUrl}/validate`, {
        params: {
          api_key: env.ZEROBOUNCE_API_KEY,
          email,
          ip_address: ipAddress || '',
        },
        timeout: this.timeout,
      });

      const data: ZeroBounceResult = response.data;

      // Map ZeroBounce status to our status
      const { status, confidence } = this.mapStatus(data.status, data.sub_status);

      logger.info('ZeroBounce verification complete', {
        email,
        status: data.status,
        sub_status: data.sub_status,
        mapped_status: status,
        confidence,
      });

      return {
        email,
        verified: status === 'verified_safe' || status === 'verified_risky',
        status,
        confidence,
        isFreeEmail: data.free_email,
        creditsUsed: 1,
      };
    } catch (err: any) {
      if (err.response?.status === 429) {
        logger.warn('ZeroBounce rate limit hit', { email });
      } else {
        logger.error('ZeroBounce API error', {
          email,
          error: err.message,
          status: err.response?.status,
        });
      }

      return {
        email,
        verified: false,
        status: 'unknown',
        confidence: 0,
        isFreeEmail: false,
        creditsUsed: 0,
      };
    }
  }

  /**
   * Batch verify emails (up to 100 at once)
   */
  async verifyBatch(emails: string[]): Promise<EmailVerificationResult[]> {
    const results: EmailVerificationResult[] = [];

    // Process in chunks of 10 to avoid overwhelming the API
    for (let i = 0; i < emails.length; i += 10) {
      const chunk = emails.slice(i, i + 10);
      const chunkResults = await Promise.all(chunk.map((email) => this.verifyEmail(email)));
      results.push(...chunkResults);

      // Small delay between chunks
      if (i + 10 < emails.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Map ZeroBounce status to our simplified status
   */
  private mapStatus(
    status: string,
    subStatus: string
  ): { status: 'verified_safe' | 'verified_risky' | 'invalid' | 'unknown'; confidence: number } {
    switch (status) {
      case 'valid':
        // Check sub_status for risk factors
        if (
          subStatus.includes('role_based') ||
          subStatus.includes('disposable') ||
          subStatus.includes('toxic')
        ) {
          return { status: 'verified_risky', confidence: 0.6 };
        }
        return { status: 'verified_safe', confidence: 0.95 };

      case 'catch-all':
        // Catch-all domains accept all emails (risky)
        return { status: 'verified_risky', confidence: 0.5 };

      case 'invalid':
      case 'spamtrap':
      case 'abuse':
      case 'do_not_mail':
        return { status: 'invalid', confidence: 0 };

      case 'unknown':
      default:
        return { status: 'unknown', confidence: 0.3 };
    }
  }

  /**
   * Get account credits remaining
   */
  async getCredits(): Promise<number> {
    try {
      if (!env.ZEROBOUNCE_API_KEY) {
        return 0;
      }

      const response = await axios.get(`${this.baseUrl}/getcredits`, {
        params: {
          api_key: env.ZEROBOUNCE_API_KEY,
        },
        timeout: this.timeout,
      });

      return parseInt(response.data.Credits, 10) || 0;
    } catch (err: any) {
      logger.error('ZeroBounce get credits error', { error: err.message });
      return 0;
    }
  }
}

