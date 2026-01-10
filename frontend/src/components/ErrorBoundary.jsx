import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-400">Application Error</h1>
                <p className="text-sm text-slate-400">Something went wrong</p>
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-4">
              <div className="text-sm font-semibold text-slate-300 mb-2">Error Details:</div>
              <div className="text-sm text-red-300 font-mono mb-2">
                {this.state.error?.toString() || 'Unknown error'}
              </div>
              {this.state.errorInfo?.componentStack && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                    Component Stack Trace
                  </summary>
                  <pre className="mt-2 text-xs text-slate-500 overflow-auto max-h-48 p-2 bg-slate-900 rounded border border-slate-700">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 px-4 rounded-lg transition-colors border border-slate-700"
              >
                Try Again
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-500 space-y-1">
                <div>If this error persists, please check:</div>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Browser console for additional errors</li>
                  <li>Network tab for failed requests</li>
                  <li>Backend server is running on port 3001</li>
                  <li>Environment variables are configured</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
