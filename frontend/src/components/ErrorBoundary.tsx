import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-bold">Something broke on this screen</h1>
        <p className="mt-2 text-muted">
          Your queued handoffs and temperature logs are safe on this device and will still sync.
        </p>
        <button
          className="mt-4 rounded-lg bg-brand px-4 py-2 font-semibold text-white"
          onClick={() => this.setState({ error: null })}
        >
          Reload screen
        </button>
      </div>
    );
  }
}
