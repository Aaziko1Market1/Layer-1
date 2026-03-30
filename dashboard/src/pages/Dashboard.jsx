import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Mail, Globe, TrendingUp, Target, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fetchBuyerStats, fetchPipelineStats, fetchEnrichmentStats } from '../api';

const TIER_COLORS = { standard: '#3b82f6', premium: '#8b5cf6', top: '#f59e0b' };
const STATUS_COLORS = { raw: '#9ca3af', extracted: '#38bdf8', classified: '#818cf8', enriched: '#34d399', verified: '#22c55e', ready: '#16a34a' };

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [enrichment, setEnrichment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchBuyerStats(), fetchPipelineStats(), fetchEnrichmentStats()])
      .then(([s, p, e]) => { setStats(s); setPipeline(p); setEnrichment(e); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>;

  const statusData = pipeline?.profiles ? Object.entries(pipeline.profiles).filter(([k]) => k !== 'total').map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#ccc' })) : [];
  const tierData = stats?.byTier ? Object.entries(stats.byTier).map(([name, value]) => ({ name, value, fill: TIER_COLORS[name] || '#ccc' })) : [];
  const countryData = stats?.topCountries?.slice(0, 10) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buyer Intelligence Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Layer 1 — AI Communicator Agents</p>
        </div>
        <Link to="/pipeline" className="btn-primary text-sm">Run ETL Pipeline</Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Total Profiles" value={pipeline?.profiles?.total || 0} color="blue" />
        <StatCard icon={Target} label="Ready for Outreach" value={pipeline?.profiles?.ready || 0} color="green" />
        <StatCard icon={Mail} label="Total Contacts" value={pipeline?.totalContacts || 0} color="purple" />
        <StatCard icon={Globe} label="With Domain" value={enrichment?.withDomain || 0} color="sky" />
        <StatCard icon={TrendingUp} label="Avg Score" value={enrichment?.scoreStats?.avg || 0} color="amber" />
        <StatCard icon={Database} label="Enriched" value={pipeline?.profiles?.enriched || 0} color="emerald" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Status */}
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Pipeline Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Tier Distribution */}
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Buyer Tiers</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                {tierData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Countries */}
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Top Countries</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={countryData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={55} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Scorers */}
      {stats?.topScorers?.length > 0 && (
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Top Scoring Buyers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Country</th>
                  <th className="pb-2 font-medium">Tier</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Shipments</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.topScorers.map((b) => (
                  <tr key={b._id} className="hover:bg-gray-50">
                    <td className="py-2">
                      <Link to={`/buyers/${b._id}`} className="text-brand-600 hover:underline font-medium">{b.companyName}</Link>
                    </td>
                    <td className="py-2 text-gray-600">{b.country}</td>
                    <td className="py-2"><span className={`badge badge-${b.tier}`}>{b.tier}</span></td>
                    <td className="py-2 font-semibold">{b.score}</td>
                    <td className="py-2 text-gray-600">{b.tradeStats?.totalShipments?.toLocaleString()}</td>
                    <td className="py-2"><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enrichment Coverage */}
      {enrichment && (
        <div className="stat-card">
          <h3 className="font-semibold text-gray-700 mb-4">Enrichment Coverage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <CoverageBar label="Domain Discovery" pct={enrichment.domainCoveragePercent} />
            <CoverageBar label="Contact Discovery" pct={enrichment.contactCoveragePercent} />
            <CoverageBar label="Apollo Enriched" pct={enrichment.total > 0 ? ((enrichment.enrichmentCoverage.apollo / enrichment.total) * 100).toFixed(1) : 0} />
            <CoverageBar label="Hunter Enriched" pct={enrichment.total > 0 ? ((enrichment.enrichmentCoverage.hunter / enrichment.total) * 100).toFixed(1) : 0} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="stat-card flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${colorMap[color] || colorMap.blue}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function CoverageBar({ label, pct }) {
  const num = parseFloat(pct) || 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{num}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, num)}%` }} />
      </div>
    </div>
  );
}
