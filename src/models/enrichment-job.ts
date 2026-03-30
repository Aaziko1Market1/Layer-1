import { ObjectId } from 'mongodb';

export interface EnrichmentJob {
  _id?: ObjectId;
  buyer_profile_id: ObjectId;
  buyer_name: string;
  steps: EnrichmentStep[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  priority: number;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface EnrichmentStep {
  name: string;
  provider: 'apollo' | 'hunter' | 'snov' | 'zerobounce' | 'brave' | 'ai';
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  result: unknown;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface AuditLog {
  _id?: ObjectId;
  action: string;
  entity_type: 'buyer_profile' | 'enrichment_job' | 'etl_run' | 'product' | 'customs';
  entity_id: ObjectId | string;
  details: Record<string, unknown>;
  created_at: Date;
}
