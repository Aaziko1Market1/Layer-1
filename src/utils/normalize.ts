/**
 * Shared utility functions for name normalization, text cleaning, etc.
 */

const COMPANY_SUFFIXES = [
  ' PVT LTD', ' PRIVATE LIMITED', ' LIMITED', ' LTD', ' LLC', ' INC',
  ' CORP', ' CORPORATION', ' S.R.L', ' SRL', ' S.A', ' SA', ' GMBH',
  ' CO.', ' CO', ' &', ' AND', ' THE',
];

export function normalizeName(name: string): string {
  if (!name) return '';
  let n = name.trim().toUpperCase();
  for (const suffix of COMPANY_SUFFIXES) {
    n = n.replace(new RegExp(suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '');
  }
  return n.replace(/\s+/g, ' ').trim();
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  } catch {
    return null;
  }
}
