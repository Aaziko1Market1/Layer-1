import { ObjectId } from 'mongodb';
import { z } from 'zod';

// ── Buyer Tier (determines AI model used) ───────────────
export type BuyerTier = 'standard' | 'premium' | 'top';

// ── Trade Record (from standard_port_data) ──────────────
export interface TradeRecord {
  _id: ObjectId;
  Importer_Name?: string;
  Exporter_Name?: string;
  HS_Code?: string;
  Product_Description?: string;
  Country?: string;
  Destination_Country?: string;
  Origin_Country?: string;
  Quantity?: number;
  Unit?: string;
  Value?: number;
  Currency?: string;
  Date?: Date;
  Port?: string;
  [key: string]: unknown;
}

// ── Buyer Profile ───────────────────────────────────────
export interface BuyerProfile {
  _id?: ObjectId;
  companyName: string;
  normalizedName: string;
  domain: string | null;
  country: string;
  tier: BuyerTier;
  industry: string | null;
  subIndustry: string | null;
  products: string[];
  hsCodes: string[];
  tradeStats: {
    totalShipments: number;
    totalValue: number;
    avgShipmentValue: number;
    topOriginCountries: { country: string; count: number }[];
    topPorts: { port: string; count: number }[];
    dateRange: { first: Date; last: Date };
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'sporadic';
  };
  contacts: ContactInfo[];
  enrichment: {
    apollo: EnrichmentResult | null;
    hunter: EnrichmentResult | null;
    snov: EnrichmentResult | null;
    brave: EnrichmentResult | null;
  };
  aiAnalysis: {
    classification: string | null;
    buyingPatterns: string | null;
    recommendedApproach: string | null;
    model: string | null;
    analyzedAt: Date | null;
  };
  status: 'raw' | 'extracted' | 'classified' | 'website_verified' | 'enriched' | 'verified' | 'ready' | 'researched' | 'contact_found' | 'contact_not_found' | 'duplicate_blocked';
  score: number;
  websiteTrust?: WebsiteTrustReport;
  verifiedWebsite?: string;
  websiteVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Contact Info ────────────────────────────────────────
export interface ContactInfo {
  name: string | null;
  title: string | null;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  linkedin: string | null;
  source: 'apollo' | 'hunter' | 'snov' | 'manual';
  discoveredAt: Date;
}

// ── Enrichment Result ───────────────────────────────────
export interface EnrichmentResult {
  source: string;
  data: Record<string, unknown>;
  fetchedAt: Date;
  status: 'success' | 'not_found' | 'error' | 'rate_limited';
  credits_used: number;
}

// ── Enrichment Job ──────────────────────────────────────
export interface EnrichmentJob {
  _id?: ObjectId;
  buyerProfileId: ObjectId;
  companyName: string;
  steps: EnrichmentStep[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  priority: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface EnrichmentStep {
  name: string;
  provider: 'apollo' | 'hunter' | 'snov' | 'zerobounce' | 'brave' | 'ai';
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  result: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
}

// ── Audit Log ───────────────────────────────────────────
export interface AuditLog {
  _id?: ObjectId;
  action: string;
  entityType: 'buyer_profile' | 'enrichment_job' | 'etl_run';
  entityId: ObjectId | string;
  details: Record<string, unknown>;
  createdAt: Date;
}

// ── AI Request/Response ─────────────────────────────────
export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  tier: BuyerTier;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  tokensUsed: { prompt: number; completion: number };
  latencyMs: number;
}

// ── Pipeline Stats ──────────────────────────────────────
export interface PipelineStats {
  totalImporters: number;
  extracted: number;
  classified: number;
  enriched: number;
  verified: number;
  ready: number;
  jobsQueued: number;
  jobsProcessing: number;
  jobsFailed: number;
  lastRunAt: Date | null;
}

// ── Zod Schemas for API validation ──────────────────────
export const BuyerSearchSchema = z.object({
  query: z.string().min(1).max(500).optional(),
  country: z.string().optional(),
  tier: z.enum(['standard', 'premium', 'top']).optional(),
  status: z.enum(['raw', 'extracted', 'classified', 'enriched', 'verified', 'ready']).optional(),
  minShipments: z.coerce.number().min(0).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['score', 'totalShipments', 'totalValue', 'updatedAt']).default('score'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type BuyerSearchParams = z.infer<typeof BuyerSearchSchema>;

export const EnrichJobCreateSchema = z.object({
  buyerProfileIds: z.array(z.string()).min(1).max(100),
  priority: z.number().min(1).max(10).default(5),
});

export const ETLRunSchema = z.object({
  country: z.string().optional(),
  limit: z.coerce.number().min(1).max(100000).default(1000),
  skipExisting: z.boolean().default(true),
});

// ── Website Trust Verification ──────────────────────────

export type TrustBand = 'high' | 'medium' | 'low' | 'rejected';
export type WebsiteCandidateSource = 'domain_inference' | 'brave_search' | 'apollo' | 'hunter' | 'trade_data';
export type MatchType = 'exact' | 'partial' | 'none';
export type AIMatchResponse = 'YES' | 'MAYBE' | 'NO' | 'ERROR';
export type SubsidiaryDetectionMethod = 'website_content' | 'name_pattern' | 'search_api' | 'none';

export interface WebsiteCandidate {
  domain: string;
  url: string;
  source: WebsiteCandidateSource;
  priority: number; // 1-5, higher = more trustworthy source
  discoveredAt: Date;
}

export interface DiscoveryInput {
  companyName: string;
  country: string;
  address?: string;
  hsCodes?: string[];
  tradeEmails?: string[];
}

export interface DiscoveryResult {
  candidates: WebsiteCandidate[];
  bestMatch: WebsiteCandidate | null;
  candidatesFound: number;
}

export interface DomainAgeCheck {
  score: number; // 0-15
  registeredDate: Date | null;
  ageYears: number | null;
  error?: string;
}

export interface SSLCheck {
  score: number; // 0-10
  hasHttps: boolean;
  certificateValid: boolean;
  error?: string;
}

export interface NameMatchCheck {
  score: number; // 0-25
  matchType: MatchType;
  tokenOverlap: number; // 0.0-1.0
  extractedText: string;
  error?: string;
}

export interface CountryMatchCheck {
  score: number; // 0-15
  websiteCountry: string | null;
  dataCountry: string;
  isAdjacent: boolean;
  error?: string;
}

export interface IndustryMatchCheck {
  score: number; // 0-15
  aiResponse: AIMatchResponse;
  matchDetail: string;
  error?: string;
}

export interface MultiSourceCheck {
  score: number; // 0-20
  apollo: boolean;
  hunter: boolean;
  tradeData: boolean;
  confirmationCount: number;
}

export interface TrustScore {
  totalScore: number;
  trustBand: TrustBand;
  checks: {
    domainAge: DomainAgeCheck;
    ssl: SSLCheck;
    nameMatch: NameMatchCheck;
    countryMatch: CountryMatchCheck;
    industryMatch: IndustryMatchCheck;
    multiSource: MultiSourceCheck;
  };
  calculatedAt: Date;
}

export interface ExtractedData {
  companyDescription: string;
  productsList: string[];
  contactEmails: string[];
  contactPhones: string[];
  officeLocations: string[];
  teamMembers: Array<{ name: string; title: string }>;
  recentNews: string[];
  extractedAt: Date;
}

export interface SubsidiaryInfo {
  isSubsidiary: boolean;
  parentCompany: string | null;
  parentIsFortune500: boolean;
  detectionMethod: SubsidiaryDetectionMethod;
  confidence: number; // 0.0-1.0
}

export interface WebsiteTrustReport {
  candidatesFound: number;
  selectedDomain: string | null;
  trustScore: number;
  trustBand: TrustBand;
  checks: {
    domainAge: DomainAgeCheck;
    ssl: SSLCheck;
    nameMatch: NameMatchCheck;
    countryMatch: CountryMatchCheck;
    industryMatch: IndustryMatchCheck;
    multiSource: MultiSourceCheck;
  };
  subsidiary: SubsidiaryInfo;
  extractedData: ExtractedData | null;
  verifiedAt: Date;
  errors: string[];
}

export interface TrustInput {
  companyName: string;
  country: string;
  hsCodes: string[];
  apolloDomain?: string;
  hunterDomain?: string;
  tradeDataDomains?: string[];
}

// ── Pipeline State Machine (12 states per spec) ────────
export type PipelineState =
  | 'new'
  | 'researched'
  | 'contact_found'
  | 'verified'
  | 'qa_pending'
  | 'qa_passed'
  | 'qa_failed'
  | 'ready'
  | 'duplicate_blocked'
  | 'suppressed'
  | 'contact_not_found'
  | 'email_unverified'
  | 'research_more';

// ── Mention Policy ─────────────────────────────────────
export interface MentionPolicy {
  safe_to_mention: string[];
  infer_only: string[];
  must_not_mention: string[];
}

// ── Channel Eligibility ────────────────────────────────
export interface ChannelEligibility {
  email: boolean;
  linkedin: boolean;
  whatsapp: boolean;
  reason: {
    email: string;
    linkedin: string;
    whatsapp: string;
  };
}

// ── Qualification Result ───────────────────────────────
export interface QualificationResult {
  action: 'CONTACT_NOW' | 'RESEARCH_MORE' | 'NURTURE_LATER' | 'SKIP';
  reasoning: string;
  model_used: string;
}

// ── Compliance Claim ───────────────────────────────────
export interface ComplianceClaim {
  claim: string;
  verified: boolean;
  confidence: number;
  source: string;
}

// ── Confidence Scores ──────────────────────────────────
export interface ConfidenceScores {
  company: 'high' | 'medium' | 'low';
  contact: 'high' | 'medium' | 'low';
  verification: 'high' | 'medium' | 'low';
  fit: 'high' | 'medium' | 'low';
}

// ── QA Record ──────────────────────────────────────────
export interface QARecord {
  sampled: boolean;
  reviewed: boolean;
  passed: boolean | null;
  reviewer: string | null;
  reviewedAt: Date | null;
  notes: string | null;
}

// ── Enriched Buyer (FINAL Layer 1 output → Layer 2) ───
export interface EnrichedBuyer {
  _id?: ObjectId;
  original_buyer_id: ObjectId;

  verified_company: {
    name: string;
    domain: string | null;
    country: string;
    address: string;
    confidence: 'high' | 'medium' | 'low';
  };

  website_trust: WebsiteTrustReport | null;

  company_research: {
    business_model: string;
    category_summary: string;
    products: string[];
    industry: string;
    size_estimate: string;
    india_fit_score: number;
    likely_buying_pattern: string;
    source_urls: string[];
  };

  contacts: Array<{
    name: string;
    title: string;
    email: string;
    email_verified: boolean;
    email_status: 'verified_safe' | 'verified_risky' | 'invalid' | 'unknown';
    email_confidence: number;
    email_source: 'apollo' | 'hunter' | 'snov' | 'website';
    linkedin: string | null;
    phone: string | null;
    phone_verified: boolean;
    role_relevance_score: number;
  }>;

  best_contact_index: number;

  trade_data: {
    hs_codes: string[];
    products: string[];
    total_amount_usd: number;
    transaction_count: number;
    last_trade_date: Date;
    trade_frequency: number;
    indian_suppliers: string[];
    buyer_tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  };

  intelligence: {
    fit_score: number;
    fit_band: 'HIGH' | 'MEDIUM' | 'LOW';
    recommended_angle: string;
    icebreaker_points: string[];
    likely_pain_points: string[];
    india_relevance: string;
    category_advantage: string;
  };

  mention_policy: MentionPolicy;

  compliance_claims: ComplianceClaim[];

  channel_eligibility: ChannelEligibility;

  qualification: QualificationResult;

  confidence: ConfidenceScores;

  pipeline_state: PipelineState;

  qa: QARecord;

  risk_flags: string[];

  created_at: Date;
  updated_at: Date;
}

// ── Role Relevance Scoring ─────────────────────────────
export function computeRoleRelevance(title: string | null): number {
  if (!title) return 0;
  const t = title.toLowerCase();

  if (/\bprocurement\b.*\b(manager|director|head|vp)\b/.test(t)) return 100;
  if (/\bsourcing\b.*\b(manager|director|head)\b/.test(t)) return 95;
  if (/\bpurchasing\b.*\b(manager|director|head)\b/.test(t)) return 90;
  if (/\bcategory\b.*\bmanager\b/.test(t)) return 85;
  if (/\b(import|trade)\b.*\bmanager\b/.test(t)) return 80;
  if (/\bsupply\s*chain\b.*\b(manager|director)\b/.test(t)) return 75;
  if (/\b(founder|ceo|owner|managing\s*director)\b/.test(t)) return 70;
  if (/\boperations\b.*\bmanager\b/.test(t)) return 60;
  if (/\bgeneral\b.*\bmanager\b/.test(t)) return 50;
  if (/\bprocurement\b|\bsourcing\b|\bpurchasing\b|\bbuyer\b/.test(t)) return 75;
  if (/\bmanager\b|\bdirector\b|\bhead\b|\bvp\b|\bchief\b/.test(t)) return 45;
  return 30;
}

// ── Dedup Decision ─────────────────────────────────────
export interface DedupDecision {
  _id?: ObjectId;
  buyer_id: ObjectId;
  matched_with: ObjectId | null;
  match_type: 'domain' | 'name' | 'parent' | 'email' | null;
  decision: 'blocked' | 'allowed';
  reason: string;
  checked_at: Date;
}

// ── SKIP Rules Classification ──────────────────────────
export function shouldSkipBuyer(profile: {
  companyName: string;
  tradeStats: { totalShipments: number; totalValue: number; dateRange: { last: Date } };
  tier: string;
}, subsidiary?: SubsidiaryInfo): { skip: boolean; reason: string } {
  const name = profile.companyName.toUpperCase();

  // Fortune 500 subsidiary with only 1 transaction
  if (subsidiary?.parentIsFortune500 && profile.tradeStats.totalShipments <= 1) {
    return { skip: true, reason: 'Fortune 500 subsidiary with only 1 transaction' };
  }

  // Transaction value < $1,000
  if (profile.tradeStats.totalValue < 1000) {
    return { skip: true, reason: 'Transaction value < $1,000 (noise)' };
  }

  // Last trade > 2 years ago
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  if (new Date(profile.tradeStats.dateRange.last) < twoYearsAgo) {
    return { skip: true, reason: 'Last trade > 2 years ago (cold)' };
  }

  // Freight forwarder, CHA, logistics
  const logisticsPatterns = /\b(freight|forwarder|forwarding|logistics|shipping|CHA|customs\s*house|clearing\s*agent|cargo|transport)\b/i;
  if (logisticsPatterns.test(name)) {
    return { skip: true, reason: 'Company is a freight forwarder/logistics company (not a buyer)' };
  }

  // Bank, insurance, government
  const nonBuyerPatterns = /\b(bank|banking|insurance|government|ministry|embassy|consulate|reserve\s*bank)\b/i;
  if (nonBuyerPatterns.test(name)) {
    return { skip: true, reason: 'Company is a bank/insurance/government agency (not a direct buyer)' };
  }

  return { skip: false, reason: '' };
}
