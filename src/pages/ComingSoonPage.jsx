import React from 'react';
import { Sparkles } from 'lucide-react';

export default function ComingSoonPage({ title }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full rounded-3xl border border-border-light bg-surface p-10 text-center shadow-xs sm:p-14">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-md">
          <Sparkles className="h-9 w-9 text-[#FF862A]" />
        </div>
        <h1 className="font-display text-2xl font-bold text-text-main sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 text-lg font-bold uppercase tracking-widest text-[#FF862A]">
          Coming Soon…
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-relaxed text-text-muted">
          This module is part of the Akshar Connect roadmap and will be available soon.
        </p>
      </div>
    </div>
  );
}
