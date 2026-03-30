import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

// ── Buyers ──────────────────────────────────────────────
export async function fetchBuyers(params = {}) {
  const { data } = await api.get('/buyers', { params });
  return data;
}

export async function fetchBuyerById(id) {
  const { data } = await api.get(`/buyers/${id}`);
  return data;
}

export async function fetchBuyerStats() {
  const { data } = await api.get('/buyers/stats');
  return data;
}

// ── Contacts ─────────────────────────────────────────────
export async function fetchContacts(params = {}) {
  const { data } = await api.get('/contacts', { params });
  return data;
}

export async function runEnrichment(body = {}) {
  const { data } = await api.post('/contacts/enrich', body);
  return data;
}

// ── Enrich All ───────────────────────────────────────────
export async function startEnrichAll(body = {}) {
  const { data } = await api.post('/enrich-all/start', body);
  return data;
}

export async function getEnrichAllProgress() {
  const { data } = await api.get('/enrich-all/progress');
  return data;
}

export async function stopEnrichAll() {
  const { data } = await api.post('/enrich-all/stop', {});
  return data;
}

// ── Jobs ────────────────────────────────────────────────
export async function fetchJobs(params = {}) {
  const { data } = await api.get('/jobs', { params });
  return data;
}

export async function fetchQueueStats() {
  const { data } = await api.get('/jobs/queue-stats');
  return data;
}

// ── Analytics ───────────────────────────────────────────
export async function fetchPipelineStats() {
  const { data } = await api.get('/analytics/pipeline');
  return data;
}

export async function fetchEnrichmentStats() {
  const { data } = await api.get('/analytics/enrichment');
  return data;
}

export async function triggerETL(params = {}) {
  const { data } = await api.post('/analytics/run-etl', params);
  return data;
}

export async function fetchAuditLog(limit = 50) {
  const { data } = await api.get('/analytics/audit', { params: { limit } });
  return data;
}

// ── Health ──────────────────────────────────────────────
export async function fetchHealth() {
  const { data } = await api.get('/health');
  return data;
}

export default api;
