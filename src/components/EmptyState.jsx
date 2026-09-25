import React from 'react';

export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="rounded-full bg-surface-hover p-4 mb-4">
        <Icon className="h-10 w-10 text-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-bold text-text-main mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-sm">{description}</p>
    </div>
  );
}
