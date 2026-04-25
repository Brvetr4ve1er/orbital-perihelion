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
      return this.props.fallback || (
        <div style={{ padding: 24, color: '#f87171', background: 'rgba(30,27,75,0.95)', borderRadius: 12, margin: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>Une erreur est survenue</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 12px' }}>
            Ce composant a rencontré un problème. Rechargez la page pour réessayer.
          </p>
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: '#a5b4fc' }}>Détails techniques</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, marginTop: 8, color: '#fca5a5' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
