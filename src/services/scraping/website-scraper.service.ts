import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../config/logger';

export interface ScrapedContent {
  about: string;
  products: string[];
  teamSize: string | null;
  news: string[];
  contacts: {
    emails: string[];
    phones: string[];
  };
}

/**
 * Website Scraper Service
 * Scrapes company websites for business information and contacts
 */
export class WebsiteScraperService {
  private readonly timeout = 10000; // 10 seconds per page
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  /**
   * Scrape website for company information
   */
  async scrapeWebsite(baseUrl: string): Promise<ScrapedContent> {
    const result: ScrapedContent = {
      about: '',
      products: [],
      teamSize: null,
      news: [],
      contacts: {
        emails: [],
        phones: [],
      },
    };

    try {
      // Try common page paths
      const pages = [
        { path: '/about', type: 'about' },
        { path: '/about-us', type: 'about' },
        { path: '/company', type: 'about' },
        { path: '/products', type: 'products' },
        { path: '/services', type: 'products' },
        { path: '/team', type: 'team' },
        { path: '/contact', type: 'contact' },
        { path: '/contact-us', type: 'contact' },
        { path: '/news', type: 'news' },
        { path: '/blog', type: 'news' },
      ];

      // Scrape home page first
      const homeContent = await this.scrapePage(baseUrl);
      if (homeContent) {
        result.about = this.extractAbout(homeContent);
        result.products = this.extractProducts(homeContent);
        result.contacts.emails = this.extractEmails(homeContent);
        result.contacts.phones = this.extractPhones(homeContent);
      }

      // Scrape other pages
      for (const page of pages) {
        try {
          const url = new URL(page.path, baseUrl).toString();
          const content = await this.scrapePage(url);
          if (!content) continue;

          switch (page.type) {
            case 'about':
              if (!result.about) {
                result.about = this.extractAbout(content);
              }
              break;
            case 'products':
              const products = this.extractProducts(content);
              result.products.push(...products);
              break;
            case 'team':
              if (!result.teamSize) {
                result.teamSize = this.extractTeamSize(content);
              }
              break;
            case 'contact':
              const emails = this.extractEmails(content);
              const phones = this.extractPhones(content);
              result.contacts.emails.push(...emails);
              result.contacts.phones.push(...phones);
              break;
            case 'news':
              const news = this.extractNews(content);
              result.news.push(...news);
              break;
          }
        } catch (err: any) {
          logger.debug('Failed to scrape page', { url: page.path, error: err.message });
        }
      }

      // Deduplicate
      result.products = [...new Set(result.products)].slice(0, 20);
      result.contacts.emails = [...new Set(result.contacts.emails)].slice(0, 10);
      result.contacts.phones = [...new Set(result.contacts.phones)].slice(0, 5);
      result.news = [...new Set(result.news)].slice(0, 5);

      return result;
    } catch (err: any) {
      logger.error('Website scraping failed', { baseUrl, error: err.message });
      return result;
    }
  }

  /**
   * Scrape a single page
   */
  private async scrapePage(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: { 'User-Agent': this.userAgent },
        maxRedirects: 3,
        validateStatus: (status) => status < 400,
      });

      return response.data;
    } catch (err: any) {
      logger.debug('Page scrape failed', { url, error: err.message });
      return null;
    }
  }

  /**
   * Extract about/description text
   */
  private extractAbout(html: string): string {
    try {
      const $ = cheerio.load(html);

      // Remove script, style, nav, footer
      $('script, style, nav, footer, header').remove();

      // Try to find about section
      const aboutSelectors = [
        '.about',
        '#about',
        '.company',
        '#company',
        '.description',
        '#description',
        'section:contains("About")',
        'div:contains("About")',
      ];

      for (const selector of aboutSelectors) {
        const text = $(selector).first().text().trim();
        if (text.length > 100) {
          return text.slice(0, 500);
        }
      }

      // Fallback: get first large paragraph
      const paragraphs = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((text) => text.length > 100);

      if (paragraphs.length > 0) {
        return paragraphs[0].slice(0, 500);
      }

      return '';
    } catch (err: any) {
      logger.debug('Extract about failed', { error: err.message });
      return '';
    }
  }

  /**
   * Extract product/service names
   */
  private extractProducts(html: string): string[] {
    try {
      const $ = cheerio.load(html);
      const products: string[] = [];

      // Try product sections
      const productSelectors = [
        '.product',
        '.service',
        '.offering',
        'section:contains("Product")',
        'section:contains("Service")',
      ];

      for (const selector of productSelectors) {
        $(selector).each((_, el) => {
          const title = $(el).find('h1, h2, h3, h4').first().text().trim();
          if (title && title.length > 3 && title.length < 100) {
            products.push(title);
          }
        });
      }

      return products.slice(0, 20);
    } catch (err: any) {
      logger.debug('Extract products failed', { error: err.message });
      return [];
    }
  }

  /**
   * Extract team size estimate
   */
  private extractTeamSize(html: string): string | null {
    try {
      const $ = cheerio.load(html);
      const text = $('body').text();

      // Count team member cards/sections
      const teamMembers = $('.team-member, .member, .employee').length;
      if (teamMembers > 0) {
        if (teamMembers >= 100) return '100+';
        if (teamMembers >= 50) return '50-100';
        if (teamMembers >= 20) return '20-50';
        if (teamMembers >= 10) return '10-20';
        return '1-10';
      }

      // Look for size mentions in text
      const sizePatterns = [
        /(\d+)\+?\s*employees/i,
        /team\s*of\s*(\d+)/i,
        /(\d+)\s*people/i,
        /staff\s*of\s*(\d+)/i,
      ];

      for (const pattern of sizePatterns) {
        const match = text.match(pattern);
        if (match) {
          const count = parseInt(match[1], 10);
          if (count >= 1000) return '1000+';
          if (count >= 200) return '200-1000';
          if (count >= 50) return '50-200';
          if (count >= 10) return '10-50';
          return '1-10';
        }
      }

      return null;
    } catch (err: any) {
      logger.debug('Extract team size failed', { error: err.message });
      return null;
    }
  }

  /**
   * Extract news/blog titles
   */
  private extractNews(html: string): string[] {
    try {
      const $ = cheerio.load(html);
      const news: string[] = [];

      $('.news-item, .blog-post, article').each((_, el) => {
        const title = $(el).find('h1, h2, h3').first().text().trim();
        if (title && title.length > 10 && title.length < 200) {
          news.push(title);
        }
      });

      return news.slice(0, 5);
    } catch (err: any) {
      logger.debug('Extract news failed', { error: err.message });
      return [];
    }
  }

  /**
   * Extract email addresses
   */
  private extractEmails(html: string): string[] {
    try {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = html.match(emailRegex) || [];

      // Filter out common noise
      const filtered = matches.filter((email) => {
        const lower = email.toLowerCase();
        return (
          !lower.includes('example.com') &&
          !lower.includes('test.com') &&
          !lower.includes('placeholder') &&
          !lower.includes('yourdomain') &&
          !lower.includes('yourcompany') &&
          !lower.endsWith('.png') &&
          !lower.endsWith('.jpg') &&
          !lower.endsWith('.gif')
        );
      });

      return [...new Set(filtered)].slice(0, 10);
    } catch (err: any) {
      logger.debug('Extract emails failed', { error: err.message });
      return [];
    }
  }

  /**
   * Extract phone numbers
   */
  private extractPhones(html: string): string[] {
    try {
      const phoneRegex = /\+?[0-9]{1,4}[-.\s]?(\([0-9]{1,4}\)|[0-9]{1,4})[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g;
      const matches = html.match(phoneRegex) || [];

      // Filter out noise (too short, too long, common patterns)
      const filtered = matches.filter((phone) => {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      });

      return [...new Set(filtered)].slice(0, 5);
    } catch (err: any) {
      logger.debug('Extract phones failed', { error: err.message });
      return [];
    }
  }
}

