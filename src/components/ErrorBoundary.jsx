import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { dataService } from '../services/dataService';

// Catches render/runtime errors in the page tree so a crash shows a friendly
// message (and emails the admin) instead of a blank, frozen screen.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' };
  }

  componentDidCatch(error, info) {
    try {
      dataService.reportError({
        message: error?.message || String(error),
        stack: (error?.stack || '') + '\n\nComponentStack:' + (info?.componentStack || ''),
        page: this.props.page || '',
      });
    } catch (e) { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-text-main">Something went wrong on this screen</h2>
        <p className="mt-2 text-sm text-text-muted">
          The team has been notified automatically. You can try reloading this section.
        </p>
        <p className="mt-2 text-[11px] text-text-muted break-words">{this.state.message}</p>
        <button
          onClick={() => this.setState({ hasError: false, message: '' })}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f]"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }
}
