import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Zap, Mail, Phone, Globe, Linkedin,
  ChevronLeft, ChevronRight, RefreshCw,
  CheckCircle2, Clock, Play, Square, AlertCircle, X,
  ChevronDown, ChevronUp, User, Building2, Plus, Trash2, Save, ShieldCheck,
  Filter, ArrowUpDown, ArrowUp, ArrowDown, Tag, Package,
} from 'lucide-react';
import { fetchBuyers, runEnrichment } from '../api';
import api from '../api';

const BUYER_TYPES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

export default function Buyers() {
  const [buyers, setBuyers] = useState([]);
  const [total, setTotal] = useState(0);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '', productSearch: '', country: '', category: '',
    hasContact: '', sort: 'totalAmount', sortDir: 'desc',
    statusFilter: '', minScore: '', maxScore: '',
  });
  const [selected, setSelected] = useState(new Set());
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [openColFilter, setOpenColFilter] = useState(null);

  // Enrich-All state
  const [jobProgress, setJobProgress] = useState(null);
  const [showJobPanel, setShowJobPanel] = useState(false);
  const [startingJob, setStartingJob] = useState(false);
  const [batchSize, setBatchSize] = useState(5);
  const [countryFilter, setCountryFilter] = useState('');
  const pollRef = useRef(null);

  const LIMIT = 50;

  const pollProgress = useCallback(async () => {
    try {
      const res = await api.get('/enrich-all/progress');
      setJobProgress(res.data);
      if (res.data.status === 'running') {
        pollRef.current = setTimeout(pollProgress, 3000);
      } else {
        if (pollRef.current) clearTimeout(pollRef.current);
      }
    } catch { }
  }, []);

  useEffect(() => {
    pollProgress();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [pollProgress]);

  const load = useCallback(async (newSkip = 0) => {
    setLoading(true);
    setSelected(new Set());
    setExpandedRow(null);
    try {
      const params = { ...filters, limit: LIMIT, skip: newSkip };
      Object.keys(params).forEach(k => { if (params[k] === '' || params[k] === undefined) delete params[k]; });
      const res = await fetchBuyers(params);
      setBuyers(res.buyers || []);
      setTotal(res.total || 0);
      setEnrichedCount(res.enrichedCount || 0);
      setSkip(newSkip);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(0); }, [load]);

  // Close column filter dropdown on outside click
  useEffect(() => {
    if (!openColFilter) return;
    const handler = (e) => {
      if (!e.target.closest('.col-filter-container')) setOpenColFilter(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openColFilter]);

  const toggleSelect = (name) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const handleEnrich = async (autoMode = false) => {
    setEnriching(true);
    setEnrichMsg('');
    try {
      const body = autoMode ? { limit: 10 } : { buyerNames: [...selected] };
      const res = await runEnrichment(body);
      setEnrichMsg(`Started enrichment for ${res.queued} buyers. Runs in background — refresh in ~2 min.`);
      setSelected(new Set());
    } catch (err) {
      setEnrichMsg('Error: ' + err.message);
    } finally {
      setEnriching(false);
    }
  };

  const handleStartEnrichAll = async () => {
    setStartingJob(true);
    try {
      const res = await api.post('/enrich-all/start', {
        batchSize,
        country: countryFilter || undefined,
        skipExisting: true,
      });
      setJobProgress(res.data.progress);
      setShowJobPanel(false);
      setTimeout(pollProgress, 2000);
    } catch (err) {
      alert('Failed to start: ' + (err.response?.data?.error || err.message));
    } finally {
      setStartingJob(false);
    }
  };

  const handleStopJob = async () => {
    try {
      await api.post('/enrich-all/stop', {});
      pollProgress();
    } catch { }
  };

  const setSort = (field) => {
    setFilters(f => ({
      ...f,
      sort: field,
      sortDir: f.sort === field && f.sortDir === 'desc' ? 'asc' : 'desc',
    }));
    setOpenColFilter(null);
  };

  const page = Math.floor(skip / LIMIT) + 1;
  const totalPages = Math.ceil(total / LIMIT);
  const isJobRunning = jobProgress?.status === 'running';

  const activeFiltersCount = [
    filters.productSearch, filters.country, filters.category,
    filters.statusFilter, filters.minScore, filters.maxScore,
    filters.hasContact,
  ].filter(Boolean).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buyers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} total · {enrichedCount.toLocaleString()} enriched
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => isJobRunning ? handleStopJob() : setShowJobPanel(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isJobRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {isJobRunning ? (
              <><Square className="w-4 h-4" /> Stop Enrichment</>
            ) : (
              <><Play className="w-4 h-4" /> Enrich All Buyers</>
            )}
          </button>

          <button
            onClick={() => handleEnrich(true)}
            disabled={enriching}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            {enriching ? 'Running...' : 'Quick Enrich 10'}
          </button>

          {selected.size > 0 && (
            <button
              onClick={() => handleEnrich(false)}
              disabled={enriching}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Enrich {selected.size} Selected
            </button>
          )}
          <button onClick={() => load(skip)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Enrich All Config Panel */}
      {showJobPanel && !isJobRunning && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-purple-900 flex items-center gap-2">
              <Play className="w-4 h-4" /> Enrich All Buyers — Configuration
            </h3>
            <button onClick={() => setShowJobPanel(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <p className="text-sm text-purple-700">
            Runs the free 3-step pipeline: <strong>Google Scraper → Global API → Apollo (free)</strong> on every buyer.
            Finds emails, phones, company domain, and contact names/positions.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Batch Size</label>
              <select
                value={batchSize}
                onChange={e => setBatchSize(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value={2}>2 — Slower, less load</option>
                <option value={5}>5 — Recommended</option>
                <option value={10}>10 — Faster</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Country Filter (optional)</label>
              <input
                value={countryFilter}
                onChange={e => setCountryFilter(e.target.value)}
                placeholder="e.g. INDIA (leave blank = all)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Skips already-enriched buyers. Can be stopped anytime.</p>
            <button
              onClick={handleStartEnrichAll}
              disabled={startingJob}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {startingJob ? 'Starting...' : 'Start Enrichment'}
            </button>
          </div>
        </div>
      )}

      {/* Job Progress Bar */}
      {jobProgress && jobProgress.status !== 'idle' && (
        <div className={`rounded-xl p-4 border ${
          isJobRunning ? 'bg-blue-50 border-blue-200' :
          jobProgress.status === 'done' ? 'bg-green-50 border-green-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isJobRunning ? (
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              ) : jobProgress.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm font-semibold text-gray-800">
                {isJobRunning ? 'Enrichment Running...' : jobProgress.status === 'done' ? 'Enrichment Complete' : `Enrichment ${jobProgress.status}`}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-700">{jobProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
            <div
              className={`h-2.5 rounded-full transition-all ${isJobRunning ? 'bg-blue-500' : jobProgress.status === 'done' ? 'bg-green-500' : 'bg-gray-400'}`}
              style={{ width: `${jobProgress.percent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="text-center">
              <p className="font-bold text-gray-900 text-base">{jobProgress.processed.toLocaleString()}</p>
              <p className="text-gray-500">Processed</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-900 text-base">{jobProgress.total.toLocaleString()}</p>
              <p className="text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-green-700 text-base">{jobProgress.found_emails.toLocaleString()}</p>
              <p className="text-gray-500">Emails Found</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-blue-700 text-base">{jobProgress.found_phones.toLocaleString()}</p>
              <p className="text-gray-500">Phones Found</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-red-600 text-base">{jobProgress.errors}</p>
              <p className="text-gray-500">Errors</p>
            </div>
          </div>
          {isJobRunning && jobProgress.current_company && (
            <p className="text-xs text-blue-600 mt-2 truncate">
              Currently: <span className="font-medium">{jobProgress.current_company}</span>
            </p>
          )}
        </div>
      )}

      {enrichMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 flex-shrink-0" /> {enrichMsg}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Company name search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search company name..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Product search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search product..."
              value={filters.productSearch}
              onChange={e => setFilters(f => ({ ...f, productSearch: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Country */}
          <input
            placeholder="Country (e.g. INDIA)"
            value={filters.country}
            onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}
            className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Buyer type / category */}
          <div className="relative">
            <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select
              value={filters.category}
              onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
              className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Types</option>
              {BUYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Contact filter */}
          <select
            value={filters.hasContact}
            onChange={e => setFilters(f => ({ ...f, hasContact: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Buyers</option>
            <option value="true">With Contacts</option>
            <option value="false">No Contacts</option>
          </select>

          {/* Status filter */}
          <select
            value={filters.statusFilter}
            onChange={e => setFilters(f => ({ ...f, statusFilter: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Status</option>
            <option value="enriched">Enriched</option>
            <option value="not_run">Not Enriched</option>
          </select>

          {/* Score range */}
          <div className="flex items-center gap-1">
            <input
              type="number" min="0" max="100"
              placeholder="Score ≥"
              value={filters.minScore}
              onChange={e => setFilters(f => ({ ...f, minScore: e.target.value }))}
              className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-gray-400 text-xs">–</span>
            <input
              type="number" min="0" max="100"
              placeholder="≤ 100"
              value={filters.maxScore}
              onChange={e => setFilters(f => ({ ...f, maxScore: e.target.value }))}
              className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Sort */}
          <select
            value={filters.sort}
            onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="totalAmount">Sort: Trade Value</option>
            <option value="transactionCount">Sort: Transactions</option>
            <option value="lead_score">Sort: Lead Score</option>
          </select>

          {activeFiltersCount > 0 && (
            <button
              onClick={() => setFilters({
                search: '', productSearch: '', country: '', category: '',
                hasContact: '', sort: 'totalAmount', sortDir: 'desc',
                statusFilter: '', minScore: '', maxScore: '',
              })}
              className="flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <X className="w-3 h-3" /> Clear ({activeFiltersCount})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : buyers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No buyers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left text-gray-600">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox"
                      checked={selected.size === buyers.length && buyers.length > 0}
                      onChange={() => selected.size === buyers.length
                        ? setSelected(new Set())
                        : setSelected(new Set(buyers.map(b => b.name)))}
                      className="rounded" />
                  </th>
                  <ColHeader label="Company" field="name" filters={filters} setSort={setSort}
                    colKey="company" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs">
                      <p className="font-medium text-gray-600 mb-1">Sort by Name</p>
                      <button onClick={() => setSort('name')} className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" /> A → Z
                      </button>
                    </div>
                  </ColHeader>
                  <ColHeader label="Country" field="country" filters={filters} setSort={setSort}
                    colKey="country" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs w-40">
                      <p className="font-medium text-gray-600 mb-1">Quick Country</p>
                      {['INDIA', 'USA', 'CANADA', 'UK', 'AUSTRALIA', 'UAE', 'GERMANY'].map(c => (
                        <button key={c} onClick={() => { setFilters(f => ({ ...f, country: c })); setOpenColFilter(null); }}
                          className={`w-full text-left px-2 py-1 hover:bg-gray-100 rounded ${filters.country === c ? 'text-brand-600 font-medium' : ''}`}>
                          {c}
                        </button>
                      ))}
                      {filters.country && <button onClick={() => { setFilters(f => ({ ...f, country: '' })); setOpenColFilter(null); }}
                        className="w-full text-left px-2 py-1 text-red-500 hover:bg-red-50 rounded">Clear</button>}
                    </div>
                  </ColHeader>
                  <ColHeader label="Score" field="lead_score" filters={filters} setSort={setSort}
                    colKey="score" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs w-36">
                      <p className="font-medium text-gray-600 mb-1">Score Range</p>
                      {[['High (70+)', '70', ''], ['Medium (40-69)', '40', '69'], ['Low (<40)', '', '39']].map(([label, min, max]) => (
                        <button key={label} onClick={() => { setFilters(f => ({ ...f, minScore: min, maxScore: max })); setOpenColFilter(null); }}
                          className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded">{label}</button>
                      ))}
                      {(filters.minScore || filters.maxScore) && (
                        <button onClick={() => { setFilters(f => ({ ...f, minScore: '', maxScore: '' })); setOpenColFilter(null); }}
                          className="w-full text-left px-2 py-1 text-red-500 hover:bg-red-50 rounded">Clear</button>
                      )}
                    </div>
                  </ColHeader>
                  <ColHeader label="Domain" field="domain_found" filters={filters} setSort={setSort}
                    colKey="domain" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs w-36">
                      <p className="font-medium text-gray-600">Sort</p>
                      <button onClick={() => setSort('domain_found')} className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded">
                        By Domain A→Z
                      </button>
                    </div>
                  </ColHeader>
                  <ColHeader label="Contact Details Found" field="contactCount" filters={filters} setSort={setSort}
                    colKey="contact" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs w-40">
                      <p className="font-medium text-gray-600 mb-1">Filter Contacts</p>
                      {[['With Email/Phone', 'true'], ['No Contacts', 'false']].map(([label, val]) => (
                        <button key={val} onClick={() => { setFilters(f => ({ ...f, hasContact: val })); setOpenColFilter(null); }}
                          className={`w-full text-left px-2 py-1 hover:bg-gray-100 rounded ${filters.hasContact === val ? 'text-brand-600 font-medium' : ''}`}>
                          {label}
                        </button>
                      ))}
                      {filters.hasContact && <button onClick={() => { setFilters(f => ({ ...f, hasContact: '' })); setOpenColFilter(null); }}
                        className="w-full text-left px-2 py-1 text-red-500 hover:bg-red-50 rounded">Clear</button>}
                    </div>
                  </ColHeader>
                  <ColHeader label="Status" field="enrichment_status" filters={filters} setSort={setSort}
                    colKey="status" openColFilter={openColFilter} setOpenColFilter={setOpenColFilter}>
                    <div className="p-2 space-y-1 text-xs w-36">
                      <p className="font-medium text-gray-600 mb-1">Filter Status</p>
                      {[['Enriched', 'enriched'], ['Not Enriched', 'not_run']].map(([label, val]) => (
                        <button key={val} onClick={() => { setFilters(f => ({ ...f, statusFilter: val })); setOpenColFilter(null); }}
                          className={`w-full text-left px-2 py-1 hover:bg-gray-100 rounded ${filters.statusFilter === val ? 'text-brand-600 font-medium' : ''}`}>
                          {label}
                        </button>
                      ))}
                      {filters.statusFilter && <button onClick={() => { setFilters(f => ({ ...f, statusFilter: '' })); setOpenColFilter(null); }}
                        className="w-full text-left px-2 py-1 text-red-500 hover:bg-red-50 rounded">Clear</button>}
                    </div>
                  </ColHeader>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {buyers.map(b => (
                  <>
                    <tr
                      key={b._id}
                      onClick={(e) => {
                        // Don't expand if clicking checkbox or links
                        if (e.target.type === 'checkbox' || e.target.closest('a') || e.target.closest('button')) return;
                        setExpandedRow(expandedRow === b._id ? null : b._id);
                      }}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(b.name) ? 'bg-brand-50' : ''} ${expandedRow === b._id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(b.name)} onChange={() => toggleSelect(b.name)} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{b.name}</p>
                        {b.category && (
                          <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium mr-1 mt-0.5">{b.category}</span>
                        )}
                        {b.products?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate" title={b.products.join(', ')}>{b.products[0]}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{b.country || '—'}</td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={b.lead_score} priority={b.lead_priority} />
                      </td>
                      <td className="px-4 py-3">
                        {b.domain && !b.domain.includes('null') ? (
                          <a href={`https://${b.domain}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-brand-600 hover:underline text-xs font-mono"
                            onClick={e => e.stopPropagation()}>
                            <Globe className="w-3 h-3" />{b.domain}
                          </a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <ContactBadges
                          emails={b.emails}
                          phones={b.phones}
                          linkedins={b.linkedins}
                          namedContacts={b.namedContacts}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EnrichStatus
                          status={b.enrichStatus}
                          enrichedAt={b.enrichedAt}
                          humanVerifiedCount={(b.contact_details || []).filter(c => c.human_verified).length}
                        />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setExpandedRow(expandedRow === b._id ? null : b._id)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                          title="View / edit contact details"
                        >
                          {expandedRow === b._id
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {expandedRow === b._id && (
                      <tr key={`${b._id}-detail`} className="bg-blue-50 border-b border-blue-100">
                        <td colSpan={8} className="px-4 py-4">
                          <ScraperDetailsPanel
                            buyer={b}
                            onSaved={(updated) => {
                              setBuyers(prev => prev.map(x => x._id === b._id ? { ...x, ...updated } : x));
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <span className="text-sm text-gray-500">
            Showing {skip + 1}–{Math.min(skip + LIMIT, total)} of {total.toLocaleString()} buyers
          </span>
          <div className="flex gap-2">
            <button onClick={() => load(Math.max(0, skip - LIMIT))} disabled={skip === 0}
              className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button onClick={() => load(skip + LIMIT)} disabled={skip + LIMIT >= total}
              className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Column Header with sort + filter dropdown ─────────────────────────────────
function ColHeader({ label, field, filters, setSort, colKey, openColFilter, setOpenColFilter, children }) {
  const isActive = filters.sort === field;
  const isOpen = openColFilter === colKey;
  return (
    <th className="px-4 py-3 font-medium">
      <div className="flex items-center gap-1 group">
        <button
          onClick={() => setSort(field)}
          className="flex items-center gap-1 hover:text-gray-900 transition-colors"
        >
          {label}
          {isActive ? (
            filters.sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-brand-600" /> : <ArrowUp className="w-3 h-3 text-brand-600" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-400" />
          )}
        </button>
        {children && (
          <div className="relative col-filter-container">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenColFilter(isOpen ? null : colKey); }}
              className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${isOpen ? 'text-brand-600 bg-brand-50' : 'text-gray-300 hover:text-gray-500'}`}
              title="Filter"
            >
              <Filter className="w-3 h-3" />
            </button>
            {isOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]">
                {children}
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  );
}

// ── Scraper Details Panel + Manual Editor ────────────────────────────────────
const EMPTY_ROW = () => ({ email: '', phone: '', name: '', position: '', linkedin: '', source: 'manual', human_verified: false, human_verified_at: null });

function ScraperDetailsPanel({ buyer, onSaved }) {
  const s = buyer.scraperSummary;

  const buildRows = () => {
    const rows = [];
    const cd = buyer.contact_details || [];
    if (cd.length > 0) {
      cd.forEach(c => rows.push({
        email: c.email || '',
        phone: c.phone || '',
        name: c.name || '',
        position: c.position || '',
        linkedin: c.linkedin || '',
        source: c.source || 'manual',
        human_verified: c.human_verified || false,
        human_verified_at: c.human_verified_at || null,
      }));
    } else if (buyer.emails?.length || buyer.phones?.length || buyer.namedContacts?.length || buyer.linkedins?.length) {
      const emails = [...(buyer.emails || [])];
      const phones = [...(buyer.phones || [])];
      const linkedins = [...(buyer.linkedins || [])];
      const names = [...(buyer.namedContacts || [])];
      const len = Math.max(emails.length, phones.length, names.length, linkedins.length, 1);
      for (let i = 0; i < len; i++) {
        rows.push({
          email: emails[i] || '',
          phone: phones[i] || '',
          name: names[i]?.name || '',
          position: names[i]?.position || '',
          linkedin: linkedins[i] || '',
          source: names[i]?.source || 'manual',
          human_verified: false,
          human_verified_at: null,
        });
      }
    } else {
      rows.push(EMPTY_ROW());
    }
    return rows;
  };

  const [rows, setRows] = useState(buildRows);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const updateRow = (i, field, val) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
    setSavedMsg('');
  };

  const toggleVerify = (i) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const nowVerified = !r.human_verified;
      return { ...r, human_verified: nowVerified, human_verified_at: nowVerified ? new Date().toISOString() : null };
    }));
    setSavedMsg('');
  };

  const addRow = () => setRows(prev => [...prev, EMPTY_ROW()]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await api.patch(`/buyers/${buyer._id}/contacts`, { contacts: rows });
      setSavedMsg(`✓ Saved ${res.data.saved} contact(s)`);
      const emails = [...new Set(rows.filter(r => r.email).map(r => r.email))];
      const phones = [...new Set(rows.filter(r => r.phone).map(r => r.phone))];
      const linkedins = [...new Set(rows.filter(r => r.linkedin).map(r => r.linkedin))];
      const namedContacts = rows.filter(r => r.name).map(r => ({ name: r.name, position: r.position || null }));
      const contact_details = rows.filter(r => r.email || r.phone || r.name || r.linkedin).map(r => ({
        email: r.email || null, phone: r.phone || null,
        name: r.name || null, position: r.position || null,
        linkedin: r.linkedin || null, source: r.source || 'manual',
        human_verified: r.human_verified || false,
        human_verified_at: r.human_verified_at || null,
      }));
      onSaved?.({ emails, phones, linkedins, namedContacts, contact_details, enrichStatus: 'complete', enrichedAt: new Date().toISOString() });
    } catch (err) {
      setSavedMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Scraper results row */}
      <div>
        <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-2 mb-2">
          <Building2 className="w-3.5 h-3.5" /> Scraper Results — {buyer.name}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Google */}
          <ScraperCard
            icon="🔍" title="Google Scraper" color="green"
            items={[
              s?.google?.biz_phone && { label: 'Phone', value: s.google.biz_phone, icon: 'phone' },
              s?.google?.biz_website && { label: 'Website', value: s.google.biz_website, icon: 'globe' },
              s?.google?.biz_address && { label: 'Address', value: s.google.biz_address, icon: 'text' },
              s?.google?.biz_rating && { label: 'Rating', value: `⭐ ${s.google.biz_rating}`, icon: 'text' },
              s?.google?.emails_found > 0 && { label: 'Emails from search', value: `${s.google.emails_found} found`, icon: 'email' },
              s?.google?.results > 0 && { label: 'Search results', value: `${s.google.results}`, icon: 'text' },
            ].filter(Boolean)}
            empty={!s?.google?.biz_phone && !s?.google?.biz_website && !s?.google?.emails_found && !s?.google?.biz_address}
          />

          {/* Global Trade API */}
          <ScraperCard
            icon="🌐" title="Global Trade API" color="blue"
            items={[
              s?.global?.pages_scraped > 0 && { label: 'Pages scraped', value: `${s.global.pages_scraped}`, icon: 'text' },
              s?.global?.industry && { label: 'Industry', value: s.global.industry, icon: 'text' },
              s?.global?.description && { label: 'Info', value: s.global.description, icon: 'text' },
              s?.global?.website && { label: 'Website', value: s.global.website, icon: 'globe' },
              s?.global?.address && { label: 'Address', value: s.global.address, icon: 'text' },
              s?.global?.emails_found > 0 && { label: 'Emails', value: `${s.global.emails_found} found`, icon: 'email' },
              s?.global?.phones_found > 0 && { label: 'Phones', value: `${s.global.phones_found} found`, icon: 'phone' },
            ].filter(Boolean)}
            empty={!s?.global?.pages_scraped && !s?.global?.emails_found && !s?.global?.industry && !s?.global?.description}
            noDataMsg={!s?.global ? 'Not yet processed' : 'No data found'}
          />

          {/* Apollo */}
          <div className="rounded-lg border p-3 bg-purple-50 border-purple-200">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">🚀</span>
              <span className="text-xs font-semibold text-purple-800">Apollo (Free)</span>
            </div>
            {s?.apollo ? (
              <div className="space-y-1.5 text-xs">
                {s.apollo.domain && (
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <Globe className="w-3 h-3 text-purple-500 flex-shrink-0" />
                    <a href={`https://${s.apollo.domain}`} target="_blank" rel="noreferrer"
                      className="font-mono text-purple-700 hover:underline truncate">{s.apollo.domain}</a>
                  </div>
                )}
                {s.apollo.org_phone && (
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <Phone className="w-3 h-3 text-green-500 flex-shrink-0" />
                    <span>{s.apollo.org_phone}</span>
                  </div>
                )}
                {s.apollo.org_linkedin && (
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <Linkedin className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <a href={s.apollo.org_linkedin} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline">Company LinkedIn</a>
                  </div>
                )}
                {s.apollo.people?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-purple-200">
                    <p className="text-xs font-medium text-purple-700 mb-1.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> {s.apollo.people.length} person{s.apollo.people.length > 1 ? 's' : ''} found
                    </p>
                    {s.apollo.people.map((p, i) => (
                      <div key={i} className="flex items-start gap-1.5 mb-1">
                        <div className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-700 text-xs font-bold">{(p.name || '?')[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{p.name}</p>
                          {p.title && <p className="text-gray-500 truncate">{p.title}</p>}
                          {p.linkedin && (
                            <a href={p.linkedin} target="_blank" rel="noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-0.5 text-xs">
                              <Linkedin className="w-2.5 h-2.5" /> LinkedIn
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!s.apollo.domain && !s.apollo.org_phone && (!s.apollo.people?.length) && (
                  <p className="text-gray-400 italic">No data found</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Not yet processed</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Manual Contact Editor ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <User className="w-4 h-4 text-brand-500" />
            Contact Details
            <span className="text-xs font-normal text-gray-400">(edit or add manually)</span>
          </h4>
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto_auto] gap-2 text-xs font-medium text-gray-500 px-1">
            <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> Name</span>
            <span>Position / Title</span>
            <span className="flex items-center gap-1"><Linkedin className="w-3 h-3" /> LinkedIn URL</span>
            <span className="flex items-center gap-1 text-emerald-600"><ShieldCheck className="w-3 h-3" /> Verify</span>
            <span></span>
          </div>

          {rows.map((row, i) => (
            <div key={i} className={`grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto_auto] gap-2 items-center rounded-lg px-1 py-0.5 transition-colors ${row.human_verified ? 'bg-emerald-50 border border-emerald-200' : ''}`}>
              <input
                value={row.email}
                onChange={e => updateRow(i, 'email', e.target.value)}
                placeholder="email@company.com"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 w-full"
              />
              <input
                value={row.phone}
                onChange={e => updateRow(i, 'phone', e.target.value)}
                placeholder="+1 234 567 8900"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 w-full"
              />
              <input
                value={row.name}
                onChange={e => updateRow(i, 'name', e.target.value)}
                placeholder="John Smith"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 w-full"
              />
              <input
                value={row.position}
                onChange={e => updateRow(i, 'position', e.target.value)}
                placeholder="Procurement Manager"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 w-full"
              />
              <input
                value={row.linkedin}
                onChange={e => updateRow(i, 'linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 w-full"
              />
              <button
                onClick={() => toggleVerify(i)}
                title={row.human_verified ? `Verified — click to unverify` : 'Mark as Human Verified'}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  row.human_verified
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                    : 'bg-white border border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {row.human_verified ? 'Verified' : 'Verify'}
              </button>
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {savedMsg ? (
            <span className={`text-xs font-medium ${savedMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
              {savedMsg}
            </span>
          ) : (
            <span className="text-xs text-gray-400">Fill in what you know — empty fields are ignored.</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Contacts'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScraperCard({ icon, title, color, items, empty, noDataMsg }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      {empty ? (
        <p className="text-xs text-gray-400 italic">{noDataMsg || 'No data found'}</p>
      ) : (
        <div className="space-y-1 text-xs text-gray-700">
          {items.map((item, i) => item && (
            <div key={i} className="flex items-start gap-1.5">
              {item.icon === 'email' && <Mail className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />}
              {item.icon === 'phone' && <Phone className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />}
              {item.icon === 'globe' && <Globe className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />}
              {item.icon === 'text' && <span className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate break-all" title={item.value}>
                <span className="font-medium text-gray-500">{item.label}: </span>
                {item.icon === 'globe'
                  ? <a href={item.value.startsWith('http') ? item.value : `https://${item.value}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{item.value}</a>
                  : item.value
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score, priority }) {
  if (!score) return <span className="text-gray-300 text-xs">—</span>;
  const color = score >= 70 ? 'text-green-700 bg-green-100' : score >= 40 ? 'text-amber-700 bg-amber-100' : 'text-gray-600 bg-gray-100';
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{score}</span>
      {priority && <span className="text-xs text-gray-400 capitalize">{priority}</span>}
    </div>
  );
}

function ContactBadges({ emails = [], phones = [], linkedins = [], namedContacts = [] }) {
  const hasEmail = emails.length > 0;
  const hasPhone = phones.length > 0;
  const hasLinkedin = linkedins.length > 0;
  const hasNames = namedContacts.length > 0;

  if (!hasEmail && !hasPhone && !hasLinkedin && !hasNames) {
    return <span className="text-gray-300 text-xs">No contacts found</span>;
  }

  return (
    <div className="space-y-1 max-w-[220px]">
      {emails.slice(0, 2).map((e, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <Mail className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span className="text-gray-700 truncate" title={e}>{e}</span>
        </div>
      ))}
      {phones.slice(0, 1).map((p, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <Phone className="w-3 h-3 text-blue-500 flex-shrink-0" />
          <span className="text-gray-700">{p}</span>
        </div>
      ))}
      {linkedins.slice(0, 1).map((l, i) => (
        <a key={i} href={l} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <Linkedin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">LinkedIn</span>
        </a>
      ))}
      {namedContacts.slice(0, 2).map((nc, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <User className="w-3 h-3 text-purple-500 flex-shrink-0" />
          <span className="text-gray-700 truncate" title={nc.name + (nc.position ? ` — ${nc.position}` : '')}>
            {nc.name}{nc.position ? <span className="text-gray-400"> · {nc.position}</span> : ''}
          </span>
        </div>
      ))}
      {(emails.length + phones.length + linkedins.length + namedContacts.length) > 3 && (
        <span className="text-xs text-gray-400">
          +{(emails.length + phones.length + linkedins.length + namedContacts.length) - 3} more
        </span>
      )}
    </div>
  );
}

function EnrichStatus({ status, enrichedAt, humanVerifiedCount = 0 }) {
  return (
    <div className="space-y-1">
      {humanVerifiedCount > 0 && (
        <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          {humanVerifiedCount} Verified
        </span>
      )}
      {status === 'not_run' && (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-gray-200" /> Not run
        </span>
      )}
      {status === 'complete' && (
        <div>
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Enriched
          </span>
          {enrichedAt && <p className="text-xs text-gray-400 mt-0.5">{new Date(enrichedAt).toLocaleDateString()}</p>}
        </div>
      )}
      {status !== 'not_run' && status !== 'complete' && (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> {status}
        </span>
      )}
    </div>
  );
}
