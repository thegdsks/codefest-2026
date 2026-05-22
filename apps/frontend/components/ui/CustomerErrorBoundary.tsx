'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render errors in the customer shell so a single component bug
 * does not blank-white the whole page. Reset reloads.
 */
export default class CustomerErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[CustomerErrorBoundary] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-[#fbf9f8] p-8 text-center font-sans">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#775a19]">
            Something went wrong
          </p>
          <p className="max-w-md text-xs text-gray-500 font-mono break-words">
            {this.state.message || 'An unexpected render error occurred.'}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-gray-700 hover:border-[#775a19] hover:text-[#775a19] transition-colors focus:outline-none"
            >
              Reload
            </button>
            <a
              href="/login"
              className="rounded bg-black px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-[#775a19] transition-colors focus:outline-none"
            >
              Back to login
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
