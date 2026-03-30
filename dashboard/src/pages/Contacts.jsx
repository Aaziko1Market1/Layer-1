import { useState, useEffect } from 'react';
import { Mail, Phone, Globe, Linkedin, RefreshCw, Copy, CheckCheck } from 'lucide-react';
import { fetchContacts } from '../api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasEmail, setHasEmail] = useState('');
  const [copied, setCopied] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (hasEmail) params.hasEmail = hasEmail;
      const res = await fetchContacts(params);
      setContacts(res.contacts || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [hasEmail]);

  const copyAll = () => {
    const emails = contacts.flatMap(c => c.emails).filter(Boolean);
    navigator.clipboard.writeText(emails.join('\n'));
    setCopied('all');
    setTimeout(() => setCopied(''), 2000);
  };

  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(''), 2000);
  };

  const totalEmails = contacts.reduce((s, c) => s + c.emails.length, 0);
  const totalPhones = contacts.reduce((s, c) => s + c.phones.length, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enriched Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} companies · {totalEmails} emails · {totalPhones} phones
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalEmails > 0 && (
            <button onClick={copyAll} className="btn-secondary text-sm flex items-center gap-2">
              {copied === 'all' ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy All Emails ({totalEmails})
            </button>
          )}
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={hasEmail}
          onChange={e => setHasEmail(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Enriched</option>
          <option value="true">With Emails Only</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No enriched contacts yet</p>
          <p className="text-sm text-gray-400 mt-1">Go to Buyers → select buyers → click "Enrich Selected" or "Auto-Enrich 10"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contacts.map(c => (
            <ContactCard key={c._id} contact={c} copied={copied} onCopy={copyEmail} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact, copied, onCopy }) {
  const hasData = contact.emails.length > 0 || contact.phones.length > 0 || contact.linkedins.length > 0;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${hasData ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-70'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate" title={contact.company_name}>
            {contact.company_name}
          </h3>
          {contact.country && <p className="text-xs text-gray-400 mt-0.5">{contact.country}</p>}
        </div>
        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
          contact.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {contact.status}
        </span>
      </div>

      {contact.domain && !contact.domain.includes('null') && (
        <a href={`https://${contact.domain}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline font-mono">
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{contact.domain}</span>
        </a>
      )}

      {!hasData && (
        <p className="text-xs text-gray-400 italic">No contacts found — domain may not have public emails</p>
      )}

      {contact.emails.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Emails
          </p>
          {contact.emails.map((email, i) => (
            <div key={i} className="flex items-center justify-between gap-2 bg-blue-50 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-gray-800 truncate" title={email}>{email}</span>
              <button onClick={() => onCopy(email)} className="flex-shrink-0 text-gray-400 hover:text-brand-600 transition-colors">
                {copied === email ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" /> Phones
          </p>
          {contact.phones.map((phone, i) => (
            <div key={i} className="flex items-center gap-2 bg-green-50 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-gray-800">{phone}</span>
            </div>
          ))}
        </div>
      )}

      {contact.linkedins.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Linkedin className="w-3.5 h-3.5" /> LinkedIn
          </p>
          {contact.linkedins.slice(0, 2).map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer"
              className="block text-xs text-brand-600 hover:underline truncate">{url}</a>
          ))}
        </div>
      )}

      {contact.enrichedAt && (
        <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
          Enriched {new Date(contact.enrichedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
