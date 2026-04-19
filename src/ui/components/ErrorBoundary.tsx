import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#f87171', background: '#1e1b4b', height: '100%' }}>
          <h2>Graph Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
            {this.state.error?.toString() + "\n" + this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
