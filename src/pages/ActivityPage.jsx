import React, { useState } from 'react';
import { Activity, User, Users } from 'lucide-react';
import ActivityFeed from '../components/ActivityFeed';

// "Activity" — every user sees their own actions; an Admin can switch to see
// everyone's activity across the Mandal.
export default function ActivityPage({ user }) {
  const isAdmin = user?.role === 'Admin';
  const [scope, setScope] = useState('mine'); // 'mine' | 'all'

  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> 📋 Activity</h1>
          <p className="text-sm font-medium text-text-muted">
            {scope === 'all' ? "Everyone's actions across the Mandal — adds, edits, follow-ups, logins and more." : "Everything you've done in the app — adds, edits, follow-ups, logins and more."}
          </p>
        </div>

        {isAdmin && (
          <div className="inline-flex shrink-0 rounded-2xl border border-border-light bg-bg-base p-1 text-sm font-bold">
            <button onClick={() => setScope('mine')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 transition-colors ${scope === 'mine' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
              <User className="h-4 w-4" /> My activity
            </button>
            <button onClick={() => setScope('all')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 transition-colors ${scope === 'all' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
              <Users className="h-4 w-4" /> Everyone
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-3xl border border-border-light bg-surface p-5 sm:p-6 shadow-xs">
        <ActivityFeed key={scope} mine={scope === 'mine'} />
      </div>
    </div>
  );
}
