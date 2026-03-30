import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Globe, Mail, Phone, Linkedin, Building2, Ship, TrendingUp, Zap } from 'lucide-react';
import { fetchBuyer, enqueueBuyerEnrichment } from '../api';

export default function BuyerDetail() {
  const { id } = useParams();
  const [buyer, setBuyer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    fetchBuyer(id).then(setBuyer).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      await enqueueBuyerEnrichment([id]);
      alert('Enrichment job queued');
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setEnriching(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;
  if (!buyer) return <div className="p-6 text-center text-gray-500">Buyer not found</div>;

  const ts = buyer.tradeStats || {};
  const ai = buyer.aiAnalysis || {};

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/buyers" className="text-sm text-gray-500 hover:text-brand-600 flex items-center gap-1 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Buyers
          </Link>
          <h1 className="text-2xl font-bold">{buyer.companyName}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`badge badge-${buyer.tier}`}>{buyer.tier}</span>
            <span className={`badge badge-${buyer.status}`}>{buyer.status}</span>
            <span className="text-sm text-gray-500">{buyer.country}</span>
            {buyer.domain && (
              <a href={`https://${buyer.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />{buyer.domain}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-bold text-brand-600">{buyer.score}</p>
            <p className="text-xs text-gray-500">Score</p>
          </div>
          <button onClick={handleEnrich} disabled={enriching} className="btn-primary flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4" />{enriching ? 'Queuing...' : 'Enrich'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade Stats */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Ship className="w-4 h-4" /> Trade Statistics</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total Shipments" value={ts.totalShipments?.toLocaleString()} />
            <Stat label="Total Value" value={ts.totalValue ? `$${(ts.totalValue / 1000).toFixed(0)}K` : 'N/A'} />
            <Stat label="Avg Shipment" value={ts.avgShipmentValue ? `$${ts.avgShipmentValue.toFixed(0)}` : 'N/A'} />
            <Stat label="Frequency" value={ts.frequency} />
          </div>
          {ts.dateRange && (
            <p className="text-xs text-gray-400">
              Date range: {new Date(ts.dateRange.first).toLocaleDateString()} — {new Date(ts.dateRange.last).toLocaleDateString()}
            </p>
          )}
          {ts.topOriginCountries?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Top Origin Countries</p>
              <div className="flex flex-wrap gap-1">
                {ts.topOriginCountries.map((c, i) => (
                  <span key={i} className="badge bg-gray-100 text-gray-700">{c.country} ({c.count})</span>
                ))}
              </div>
            </div>
          )}
          {ts.topPorts?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Top Ports</p>
              <div className="flex flex-wrap gap-1">
                {ts.topPorts.map((p, i) => (
                  <span key={i} className="badge bg-gray-100 text-gray-700">{p.port} ({p.count})</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contacts */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Mail className="w-4 h-4" /> Contacts ({buyer.contacts?.length || 0})</h3>
          {buyer.contacts?.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {buyer.contacts.map((c, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.name || 'Unknown'}</p>
                      {c.title && <p className="text-xs text-gray-500">{c.title}</p>}
                    </div>
                    <span className={`badge ${c.emailVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'} text-xs`}>
                      {c.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="flex items-center gap-1.5 text-gray-600"><Mail className="w-3 h-3" />{c.email}</p>
                    {c.phone && <p className="flex items-center gap-1.5 text-gray-600"><Phone className="w-3 h-3" />{c.phone}</p>}
                    {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-brand-600 hover:underline"><Linkedin className="w-3 h-3" />LinkedIn</a>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Source: {c.source}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No contacts discovered yet. Run enrichment to find contacts.</p>
          )}
        </div>

        {/* Products & HS Codes */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Building2 className="w-4 h-4" /> Products & Classification</h3>
          {buyer.industry && (
            <div className="text-sm">
              <span className="text-gray-500">Industry:</span>{' '}
              <span className="font-medium">{buyer.industry}</span>
              {buyer.subIndustry && <span className="text-gray-400"> / {buyer.subIndustry}</span>}
            </div>
          )}
          {buyer.products?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Products ({buyer.products.length})</p>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {buyer.products.slice(0, 20).map((p, i) => (
                  <span key={i} className="badge bg-blue-50 text-blue-700 text-xs">{p}</span>
                ))}
                {buyer.products.length > 20 && <span className="badge bg-gray-100 text-gray-500 text-xs">+{buyer.products.length - 20} more</span>}
              </div>
            </div>
          )}
          {buyer.hsCodes?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">HS Codes ({buyer.hsCodes.length})</p>
              <div className="flex flex-wrap gap-1">
                {buyer.hsCodes.slice(0, 15).map((h, i) => (
                  <span key={i} className="badge bg-purple-50 text-purple-700 font-mono text-xs">{h}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Analysis */}
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> AI Analysis</h3>
          {ai.analyzedAt ? (
            <>
              <p className="text-xs text-gray-400">Model: {ai.model} | Analyzed: {new Date(ai.analyzedAt).toLocaleString()}</p>
              {ai.classification && <JsonBlock title="Classification" data={ai.classification} />}
              {ai.buyingPatterns && <JsonBlock title="Buying Patterns" data={ai.buyingPatterns} />}
              {ai.recommendedApproach && <JsonBlock title="Outreach Strategy" data={ai.recommendedApproach} />}
            </>
          ) : (
            <p className="text-sm text-gray-400">No AI analysis yet. Classify or run full enrichment.</p>
          )}
        </div>
      </div>

      {/* Enrichment Results */}
      {Object.values(buyer.enrichment || {}).some(Boolean) && (
        <div className="stat-card space-y-4">
          <h3 className="font-semibold text-gray-700">Enrichment Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(buyer.enrichment || {}).map(([provider, result]) => result && (
              <div key={provider} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm capitalize">{provider}</span>
                  <span className={`badge ${result.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result.status}</span>
                </div>
                <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-auto max-h-40">{JSON.stringify(result.data, null, 2)}</pre>
                <p className="text-xs text-gray-400 mt-1">Credits: {result.credits_used} | {new Date(result.fetchedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-semibold">{value ?? 'N/A'}</p>
    </div>
  );
}

function JsonBlock({ title, data }) {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { parsed = data; }
  }
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-40 text-gray-700">
        {typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : parsed}
      </pre>
    </div>
  );
}
