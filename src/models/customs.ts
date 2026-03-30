import { ObjectId } from 'mongodb';

/**
 * Customs intelligence entry — matches build_customs_index.py output.
 * Keyed by HS code + importing country + exporting country.
 */
export interface CustomsIntelligence {
  _id?: ObjectId;
  _key: string;
  hs_code: string;
  hs_code_6: string;
  importing_country: string;
  exporting_country: string;
  product_name: string;

  // Tariff data
  tariff_data?: TariffEntry[];
  tariff_year?: string;
  tariff_source?: string;
  tariff_updated_at?: Date;

  // Regulatory data
  regulatory_data?: RegulatoryEntry[];
  regulatory_mode?: string;
  regulatory_source?: string;
  regulatory_updated_at?: Date;

  // Competitor data
  competitors?: CompetitorEntry[];
  competitor_year?: string;
  competitor_month?: string;
  competitor_source?: string;
  competitor_updated_at?: Date;

  // Trade remedies
  trade_remedies?: TradeRemedyEntry[];
  trade_remedies_updated_at?: Date;

  created_at?: Date;
  updated_at?: Date;
}

export interface TariffEntry {
  ntlc_code: string;
  ntlc_description: string;
  applied_tariff: string;
  mfn_tariff: string;
  preferential_tariff: string;
  tariff_regime: string;
}

export interface RegulatoryEntry {
  section: string;
  direction: string;
  total_count: string;
  measure_type: string;
  measure_name: string;
  imposing_country: string;
}

export interface CompetitorEntry {
  country_code: string;
  country_name: string;
  trade_value: string;
  market_share: string;
  growth_rate: string;
}

export interface TradeRemedyEntry {
  measure_type: string;
  description: string;
  imposing_country: string;
  status: string;
}
