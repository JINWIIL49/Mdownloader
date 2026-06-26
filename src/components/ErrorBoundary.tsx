import React from "react";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: React.ErrorInfo | null };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null } as State;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console and keep the information in state so it can be displayed
    // in the browser for easier debugging during development.
    // eslint-disable-next-line no-console
    console.error("Uncaught error:", error, info);
    this.setState({ error, info });
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div style={{ padding: 24 }}>
          <h1 style={{ marginTop: 0 }}>Application error</h1>
          <p style={{ color: "#c00" }}>{error?.message}</p>
          {info?.componentStack && (
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{info.componentStack}</pre>
          )}
          <details style={{ marginTop: 12 }}>
            <summary>Console error (click to expand)</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(error)}</pre>
          </details>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
