import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { RefreshCw, Activity as ActivityIcon, Smartphone, Clock } from 'lucide-react';

// Emoji per action kind for quick scanning.
const ACTION_EMOJI = {
  'add-devotee': '🆕', 'update-devotee': '✏️', 'delete-devotee': '🗑️',
  'add-event': '📅', 'update-event': '🗓️', 'delete-event': '❌',
  followup: '📞', 'bulk-tags': '🏷️', area: '🗺️', login: '🔓', logout: '🔒',
};

function timeAgo(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fullTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// "Digesh Patel (99…)" -> "Digesh Patel"
const actorName = (a) => String(a || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Someone';

const FIRST_BATCH = 15;
export default function ActivityFeed({ mine = false, limit = 300 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');

  // Progressive load (#120): show the first few newest actions immediately, then
  // fetch the rest in the background so the user isn't staring at a spinner.
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const first = await dataService.getActivity({ mine, limit: FIRST_BATCH });
      setRows(first);
      setLoading(false);
      if (first.length >= FIRST_BATCH) {
        setLoadingMore(true);
        try {
          const full = await dataService.getActivity({ mine, limit });
          setRows(full);
        } finally { setLoadingMore(false); }
      }
    } catch (e) { setErr('Could not load activity. Pull to refresh.'); setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mine]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-text-muted">{loading ? 'Loading…' : `${rows.length}${loadingMore ? '+' : ''} ${mine ? 'of your actions' : 'recent actions'}${loadingMore ? ' · loading more…' : ''}`}</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs font-bold text-text-main hover:bg-bg-base">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {err && <p className="text-xs font-bold text-red-500 mb-2">{err}</p>}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted">
          <ActivityIcon className="h-8 w-8 opacity-40" />
          <p className="text-sm font-semibold">No activity yet.</p>
        </div>
      )}

      <ol className="relative space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl border border-border-light bg-surface px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{ACTION_EMOJI[r.action] || '•'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-main break-words">
                {!mine && <span className="font-black">{actorName(r.actor)} </span>}
                {r.detail || r.action}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-text-muted">
                <span className="inline-flex items-center gap-1" title={fullTime(r.ts)}><Clock className="h-3 w-3" /> {timeAgo(r.ts)}</span>
                {r.device && <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {r.device}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
