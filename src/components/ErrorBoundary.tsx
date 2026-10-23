import React from 'react';

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#02061a', color: '#fff', fontFamily: 'sans-serif', padding: 24, textAlign: 'center' }}>
        <div>
          <h2>Something went wrong</h2>
          <p style={{ opacity: 0.7 }}>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: '#059669', color: '#fff', border: 0, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
