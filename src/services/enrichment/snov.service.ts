import axios from 'axios';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

export interface SnovContact {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  email: string;
  source: string;
}

export interface SnovResponse {
  success: boolean;
  contacts: SnovContact[];
  creditsUsed: number;
}

/**
 * Snov.io API Service
 * Domain email search and contact discovery
 */
export class SnovService {
  private readonly baseUrl = 'https://api.snov.io/v1';
  private readonly timeout = 5000;

  /**
   * Search for contacts by domain
   */
  async searchByDomain(domain: string): Promise<SnovResponse> {
    try {
      if (!env.SNOV_CLIENT_ID) {
        logger.warn('Snov API key not configured');
        return { success: false, contacts: [], creditsUsed: 0 };
      }

      const response = await axios.post(
        `${this.baseUrl}/get-domain-emails-with-info`,
        {
          domain,
          type: 'all',
          limit: 10,
        },
        {
          headers: {
            'Authorization': `Bearer ${env.SNOV_CLIENT_ID}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      if (response.data.success === false) {
        logger.warn('Snov API returned error', { domain, error: response.data.error });
        return { success: false, contacts: [], creditsUsed: 0 };
      }

      const contacts: SnovContact[] = (response.data.emails || []).map((item: any) => ({
        name: item.name || null,
        firstName: item.firstName || null,
        lastName: item.lastName || null,
        position: item.position || null,
        email: item.email,
        source: 'snov',
      }));

      logger.info('Snov domain search successful', {
        domain,
        contactsFound: contacts.length,
      });

      return {
        success: true,
        contacts,
        creditsUsed: 1,
      };
    } catch (err: any) {
      if (err.response?.status === 429) {
        logger.warn('Snov rate limit hit', { domain });
        return { success: false, contacts: [], creditsUsed: 0 };
      }

      logger.error('Snov API error', {
        domain,
        error: err.message,
        status: err.response?.status,
      });

      return { success: false, contacts: [], creditsUsed: 0 };
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(email: string): Promise<{
    valid: boolean;
    status: string;
    creditsUsed: number;
  }> {
    try {
      if (!env.SNOV_CLIENT_ID) {
        return { valid: false, status: 'unknown', creditsUsed: 0 };
      }

      const response = await axios.post(
        `${this.baseUrl}/get-emails-verification-status`,
        {
          emails: [email],
        },
        {
          headers: {
            'Authorization': `Bearer ${env.SNOV_CLIENT_ID}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      const result = response.data[0];
      const valid = result.status === 'valid';

      return {
        valid,
        status: result.status,
        creditsUsed: 1,
      };
    } catch (err: any) {
      logger.error('Snov email verification error', {
        email,
        error: err.message,
      });

      return { valid: false, status: 'unknown', creditsUsed: 0 };
    }
  }
}

