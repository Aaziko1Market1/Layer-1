import { useState, useEffect } from 'react';
import { Play, RefreshCw, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { fetchPipelineStats, fetchQueueStats, fetchJobs, fetchAuditLog, triggerETL } from '../api';

export default function Pipeline() {
  const [pipeline, setPipeline] = useState(null);
  const [queue, setQueue] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [etlParams, setEtlParams] = useState({ limit: 500, country: '', skipExisting: true });

  const load = async () => {
    setLoading(true);
    try {
      const [p, q, j, a] = await Promise.all([
        fetchPipelineStats(),
        fetchQueueStats().catch(() => null),
        fetchJobs({ limit: 10 }),
        fetchAuditLog(20),
      ]);
      setPipeline(p);
      setQueue(q);
      setJobs(j?.data || []);
      setAudit(a?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const params = { limit: etlParams.limit, skipExisting: etlParams.skipExisting };
      if (etlParams.country) params.country = etlParams.country;
      await triggerETL(params);
      alert('ETL pipeline started. Refresh to see progress.');
      setTimeout(load, 3000);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;

  const p = pipeline?.profiles || {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ETL Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Extract → Classify → Enrich → Verify → Ready</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Pipeline Progress */}
      <div className="stat-card">
        <h3 className="font-semibold text-gray-700 mb-4">Pipeline Progress</h3>
        <div className="flex items-center gap-2">
          {['raw', 'extracted', 'classified', 'enriched', 'verified', 'ready'].map((stage, i) => (
            <div key={stage} className="flex-1">
              <div className="text-center mb-2">
                <p className="text-lg font-bold">{p[stage] || 0}</p>
                <p className="text-xs text-gray-500 capitalize">{stage}</p>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div
                  className={`h-2 rounded-full transition-all ${
                    stage === 'ready' ? 'bg-green-500' : stage === 'verified' ? 'bg-green-400' : stage === 'enriched' ? 'bg-emerald-400' : stage === 'classified' ? 'bg-indigo-400' : stage === 'extracted' ? 'bg-sky-400' : 'bg-gray-400'
                  }`}
                  style={{ width: p.total > 0 ? `${((p[stage] || 0) / p.total) * 100}%` : '0%' }}
                />
              </div>
              {i < 5 && <div className="text-center text-gray-300 text-xs mt-1">→</div>}
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Total: {p.total || 0} profiles | Contacts: {pipeline?.totalContacts || 0}
          {pipeline?.lastRunAt && <span> | Last run: {new Date(pipeline.lastRunAt).toLocaleString()}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Run ETL */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Play className="w-4 h-4" /> Run ETL</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Extract Limit</label>
              <input type="number" value={etlParams.limit} onChange={e => setEtlParams(p => ({ ...p, limit: parseInt(e.target.value) || 500 }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Country Filter (optional)</label>
              <input type="text" value={etlParams.country} onChange={e => setEtlParams(p => ({ ...p, country: e.target.value }))}
                placeholder="e.g., INDIA, USA, GERMANY"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={etlParams.skipExisting} onChange={e => setEtlParams(p => ({ ...p, skipExisting: e.target.checked }))} className="rounded" />
              Skip existing profiles
            </label>
            <button onClick={handleRun} disabled={running} className="btn-primary w-full flex items-center justify-center gap-2">
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Running...</> : <><Play className="w-4 h-4" /> Start Pipeline</>}
            </button>
          </div>
        </div>

        {/* Queue Stats */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> Job Queue</h3>
          {queue ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <QStat label="Waiting" value={queue.waiting} color="text-amber-600" />
              <QStat label="Active" value={queue.active} color="text-blue-600" />
              <QStat label="Completed" value={queue.completed} color="text-green-600" />
              <QStat label="Failed" value={queue.failed} color="text-red-600" />
              <QStat label="Delayed" value={queue.delayed} color="text-gray-600" />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Queue stats unavailable (Redis may not be running)</p>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Recent Enrichment Jobs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Steps</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(j => (
                  <tr key={j._id} className="hover:bg-gray-50">
                    <td className="py-2 font-medium">{j.companyName}</td>
                    <td className="py-2">
                      <span className={`badge ${j.status === 'completed' ? 'bg-green-100 text-green-700' : j.status === 'failed' ? 'bg-red-100 text-red-700' : j.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {j.steps?.map((s, i) => (
                          <span key={i} title={`${s.name}: ${s.status}`} className={`w-2 h-2 rounded-full ${s.status === 'done' ? 'bg-green-500' : s.status === 'failed' ? 'bg-red-500' : s.status === 'running' ? 'bg-blue-500 animate-pulse' : s.status === 'skipped' ? 'bg-gray-300' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{new Date(j.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {audit.length > 0 && (
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Recent Activity</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {audit.map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-0.5">
                  {a.action.includes('extract') ? <CheckCircle2 className="w-4 h-4 text-sky-500" /> :
                   a.action.includes('classify') ? <CheckCircle2 className="w-4 h-4 text-indigo-500" /> :
                   a.action.includes('delete') ? <XCircle className="w-4 h-4 text-red-500" /> :
                   <CheckCircle2 className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <p className="text-gray-700">{a.action}</p>
                  <p className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()} — {JSON.stringify(a.details)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QStat({ label, value, color }) {
  return (
    <div className="text-center p-3 bg-gray-50 rounded-lg">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
