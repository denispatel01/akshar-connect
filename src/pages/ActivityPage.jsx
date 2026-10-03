import React from 'react';
import { Activity } from 'lucide-react';
import ActivityFeed from '../components/ActivityFeed';

// "My Activity" — every logged-in user can see their own actions here.
export default function ActivityPage() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-main flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> 📋 My Activity</h1>
        <p className="text-sm font-medium text-text-muted">Everything you've done in the app — adds, edits, follow-ups, logins and more.</p>
      </div>
      <div className="rounded-3xl border border-border-light bg-surface p-5 sm:p-6 shadow-xs">
        <ActivityFeed mine />
      </div>
    </div>
  );
}
