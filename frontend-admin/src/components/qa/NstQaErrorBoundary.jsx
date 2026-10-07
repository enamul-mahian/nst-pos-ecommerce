import React from 'react';

class NstQaErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[NST QA Error Boundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: '#f7f7fb',
            color: '#1f2937',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '28px',
              borderRadius: '24px',
              background: '#ffffff',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)',
            }}
          >
            <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>
              Something went wrong
            </h1>

            <p style={{ margin: '0 0 20px', lineHeight: 1.6 }}>
              The NST Admin interface encountered an unexpected error.
              Please reload the page and try again.
            </p>

            {import.meta.env.DEV && this.state.error?.message && (
              <pre
                style={{
                  overflow: 'auto',
                  padding: '14px',
                  borderRadius: '12px',
                  background: '#f3f4f6',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {this.state.error.message}
              </pre>
            )}

            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                marginTop: '18px',
                border: 0,
                borderRadius: '12px',
                padding: '11px 18px',
                cursor: 'pointer',
                background: '#6d28d9',
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              Reload NST Admin
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { NstQaErrorBoundary };
export default NstQaErrorBoundary;