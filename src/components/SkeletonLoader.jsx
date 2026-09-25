import React from 'react';

export function CardSkeleton() {
  return (
    <div className="rounded-3xl border border-border-light bg-surface p-5 animate-pulse flex flex-col justify-between h-full">
      <div>
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl bg-bg-base"></div>
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="h-4 bg-bg-base rounded w-3/4"></div>
            <div className="h-3 bg-bg-base rounded w-1/2"></div>
            <div className="h-3 bg-bg-base rounded w-5/6 mt-2"></div>
            <div className="h-3 bg-bg-base rounded w-2/3"></div>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-border-light flex items-center justify-between">
        <div className="h-6 w-16 bg-bg-base rounded-full"></div>
        <div className="flex gap-2">
          <div className="h-8 w-8 bg-bg-base rounded-xl"></div>
          <div className="h-8 w-24 bg-bg-base rounded-xl"></div>
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
