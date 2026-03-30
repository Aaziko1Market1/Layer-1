import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { fetchHealth } from '../api';

const STATUS_ICON = {
  ok: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  configured: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  unavailable: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  not_configured: <AlertTriangle className="w-5 h-5 text-amber-500" />,
};

export default function HealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchHealth().then(setHealth).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;

  const checks = health?.checks || {};

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-gray-500 mt-1">{health?.service} v{health?.version}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge text-sm ${health?.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {health?.status?.toUpperCase()}
          </span>
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {health?.uptime && (
        <p className="text-sm text-gray-500">Uptime: {formatUptime(health.uptime)}</p>
      )}

      {/* Infrastructure */}
      <div className="stat-card space-y-3">
        <h3 className="font-semibold text-gray-700">Infrastructure</h3>
        <ServiceRow name="MongoDB" status={checks.mongodb} />
        <ServiceRow name="Redis" status={checks.redis} />
        <ServiceRow name="Ollama (Local AI)" status={checks.ollama} extra={checks.ollama?.model && `Model: ${checks.ollama.model}`} />
      </div>

      {/* SiliconFlow */}
      {checks.siliconflow && (
        <div className="stat-card space-y-3">
          <h3 className="font-semibold text-gray-700">SiliconFlow API</h3>
          <div className="flex items-center gap-2">
            {STATUS_ICON[checks.siliconflow.status] || STATUS_ICON.error}
            <span className="font-medium text-sm">{checks.siliconflow.status}</span>
          </div>
          {checks.siliconflow.models && (
            <div className="text-sm text-gray-500 space-y-1">
              <p>Standard: <span className="font-mono text-xs">{checks.siliconflow.models.standard}</span></p>
              <p>Premium: <span className="font-mono text-xs">{checks.siliconflow.models.premium}</span></p>
            </div>
          )}
        </div>
      )}

      {/* Enrichment APIs */}
      {checks.enrichment && (
        <div className="stat-card space-y-3">
          <h3 className="font-semibold text-gray-700">Enrichment APIs</h3>
          {Object.entries(checks.enrichment).map(([name, status]) => (
            <div key={name} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm capitalize font-medium">{name}</span>
              <div className="flex items-center gap-2">
                {STATUS_ICON[status] || STATUS_ICON.error}
                <span className="text-sm text-gray-500">{status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ name, status, extra }) {
  const st = status?.status || 'error';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm font-medium">{name}</span>
      <div className="flex items-center gap-2">
        {STATUS_ICON[st] || STATUS_ICON.error}
        <span className="text-sm text-gray-500">{st}</span>
        {extra && <span className="text-xs text-gray-400 ml-2">{extra}</span>}
        {status?.message && <span className="text-xs text-red-400 ml-2">{status.message}</span>}
      </div>
    </div>
  );
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
