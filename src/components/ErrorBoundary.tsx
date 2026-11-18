import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[InteriorX ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-[#0A0A0B] p-6">
          <div className="max-w-lg w-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] rounded-xl p-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-stone-100">
              InteriorX — System Recovery
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              An unexpected error occurred while rendering this view.
            </p>
            <pre className="mt-4 p-3 rounded-lg bg-neutral-100 dark:bg-black/50 text-xs text-red-600 dark:text-red-400 overflow-x-auto">
              {this.state.errorMessage}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-5 py-2.5 rounded-lg bg-[#C8A24E] text-black font-semibold text-sm hover:bg-[#DFBE6F] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
