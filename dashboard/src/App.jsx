import { Routes, Route, NavLink } from 'react-router-dom';
import { Brain, Users, BarChart3, Activity, Zap, Mail } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Buyers from './pages/Buyers';
import Contacts from './pages/Contacts';
import Pipeline from './pages/Pipeline';
import HealthPage from './pages/HealthPage';

const navItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/buyers', icon: Users, label: 'Buyers' },
  { to: '/contacts', icon: Mail, label: 'Contacts' },
  { to: '/pipeline', icon: Zap, label: 'Pipeline' },
  { to: '/health', icon: Activity, label: 'Health' },
];

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-gray-300 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8 text-brand-400" />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Buyer Intel</h1>
              <p className="text-xs text-gray-500">Aaziko · AI Pipeline</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
          v1.0.0 · Contact Discovery
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/buyers" element={<Buyers />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/health" element={<HealthPage />} />
        </Routes>
      </main>
    </div>
  );
}
