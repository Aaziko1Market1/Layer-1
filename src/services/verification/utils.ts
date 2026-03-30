/**
 * Utility functions for website trust verification
 */

// Legal suffixes to remove from company names
export const LEGAL_SUFFIXES = [
  'GmbH', 'Ltd', 'LLC', 'Inc', 'SA', 'AG', 'BV', 'SRL', 'Pty',
  'Corp', 'Co', 'Limited', 'Incorporated', 'Corporation',
  'LTD', 'INC', 'GMBH', 'PTY', 'CORP',
];

// Social media and directory sites to filter out
export const SOCIAL_MEDIA_FILTERS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'wikipedia.org', 'bloomberg.com', 'crunchbase.com', 'dnb.com',
  'yellowpages', 'yelp.com', 'glassdoor.com',
];

// Well-known parent companies
export const WELL_KNOWN_PARENTS = [
  'DOW', 'BASF', 'SIEMENS', 'UNILEVER', 'P&G', 'PROCTER & GAMBLE',
  '3M', 'DUPONT', 'BAYER', 'SHELL', 'BP', 'EXXON', 'CHEVRON',
  'TOTAL', 'NESTLE', 'COCA-COLA', 'PEPSICO', 'JOHNSON & JOHNSON',
  'PFIZER', 'MERCK', 'NOVARTIS', 'ROCHE', 'SANOFI',
  'GLAXOSMITHKLINE', 'ASTRAZENECA',
];

// Country TLD mapping
export const COUNTRY_TLDS: Record<string, string> = {
  'INDIA': 'in', 'GERMANY': 'de', 'FRANCE': 'fr',
  'UNITED KINGDOM': 'uk', 'UK': 'uk', 'CHINA': 'cn',
  'JAPAN': 'jp', 'SOUTH KOREA': 'kr', 'BRAZIL': 'br',
  'MEXICO': 'mx', 'CANADA': 'ca', 'AUSTRALIA': 'au',
  'ITALY': 'it', 'SPAIN': 'es', 'NETHERLANDS': 'nl',
  'BELGIUM': 'be', 'SWITZERLAND': 'ch', 'AUSTRIA': 'at',
  'POLAND': 'pl', 'TURKEY': 'tr',
};

export function cleanCompanyName(companyName: string): string {
  let cleaned = companyName.trim();
  for (const suffix of LEGAL_SUFFIXES) {
    const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function toDomainFormat(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
}

export function isSocialMediaOrDirectory(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SOCIAL_MEDIA_FILTERS.some(filter => lowerUrl.includes(filter));
}


export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter(token => token.length > 0);
}

export function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));
  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  return intersection.size / union.size;
}

export function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  return match ? match[1].toLowerCase() : null;
}

export function getCountryTLD(country: string): string | null {
  return COUNTRY_TLDS[country.toUpperCase()] || null;
}

export function containsWellKnownParent(companyName: string): string | null {
  const upperName = companyName.toUpperCase();
  for (const parent of WELL_KNOWN_PARENTS) {
    if (upperName.includes(parent)) return parent;
  }
  return null;
}

export function calculateDomainAge(registrationDate: Date): number {
  const now = new Date();
  const ageMs = now.getTime() - registrationDate.getTime();
  return Math.max(0, ageMs / (1000 * 60 * 60 * 24 * 365.25));
}

export function scoreDomainAge(ageYears: number): number {
  if (ageYears > 5) return 15;
  if (ageYears >= 2) return 10;
  if (ageYears >= 1) return 5;
  return 0;
}
