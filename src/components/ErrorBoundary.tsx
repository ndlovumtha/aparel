import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      let parsedError: { error?: string; operationType?: string; path?: string } | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-[#0b0c0e] text-[#e5e7eb] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#11141b] border border-rose-500/40 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-bold uppercase tracking-tight text-white">
                Database Operation Error
              </h2>
            </div>

            {parsedError ? (
              <div className="p-3 bg-[#0c0e13] border border-[#232934] text-xs font-mono space-y-1 text-slate-300">
                <p>
                  <span className="text-slate-500">Operation:</span>{' '}
                  <span className="text-[#ccff00]">{parsedError.operationType}</span>
                </p>
                {parsedError.path && (
                  <p>
                    <span className="text-slate-500">Path:</span> {parsedError.path}
                  </p>
                )}
                <p className="text-rose-300 pt-1">{parsedError.error}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-300 font-mono">{this.state.errorMessage}</p>
            )}

            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Reload Interface</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
