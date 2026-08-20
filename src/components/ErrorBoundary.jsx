import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// React unmounts the ENTIRE tree on any uncaught render error unless something
// catches it — with no boundary anywhere, that showed up as "a blank white
// screen" with zero clue why. This is the safety net: whatever throws,
// whenever, shows a recoverable message instead of nothing.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: 'var(--bg-main, #f8fafc)'
      }}>
        <div className="glass-card" style={{ maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center', alignItems: 'center' }}>
          <AlertTriangle size={36} color="var(--danger)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Đã có lỗi xảy ra</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Ứng dụng gặp sự cố không mong muốn — có thể do dữ liệu tải về bất thường (mạng chập chờn).
            Bấm nút bên dưới để tải lại trang.
          </p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {this.state.error.message || String(this.state.error)}
          </p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            <RefreshCw size={16} /> Tải Lại Trang
          </button>
        </div>
      </div>
    );
  }
}
