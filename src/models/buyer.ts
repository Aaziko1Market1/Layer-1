import { ObjectId } from 'mongodb';

/**
 * Buyer profile as hydrated by build_buyer_profiles.py
 * Matches the Python ETL output schema exactly.
 */
export interface BuyerProfile {
  _id?: ObjectId;
  normalized_name: string;
  buyer_name: string;
  buyer_name_en: string;
  country_code: string;
  country: string;
  hs_codes: string[];
  hs_codes_2digit: string[];
  product_descriptions: string[];
  total_trade_volume_usd: number;
  trade_count: number;
  first_trade_date: string | Date | null;
  last_trade_date: string | Date | null;
  trade_frequency: 'weekly' | 'monthly' | 'quarterly' | 'sporadic' | 'one-time';
  ports_used: string[];
  origin_countries: string[];
  export_countries: string[];
  indian_suppliers: string[];
  importer_codes: string[];
  buyer_addresses: string[];
  buyer_tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  enrichment_status: 'raw' | 'researching' | 'enriched' | 'verified' | 'ready' | 'failed';
  contacts: ContactInfo[];
  domain: string | null;
  score: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface ContactInfo {
  name: string | null;
  title: string | null;
  email: string;
  email_verified: boolean;
  phone: string | null;
  linkedin: string | null;
  source: 'apollo' | 'hunter' | 'snov' | 'manual' | 'brave';
  confidence: number;
  discovered_at: Date;
}

export type BuyerTier = 'platinum' | 'gold' | 'silver' | 'bronze';
