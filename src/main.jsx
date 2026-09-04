import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';
import { initTheme } from './services/theme.js';
import { loadSession } from './services/api.js';
import { bounceToPortal, clearBounceFlag } from './services/karofiSession.js';
import './index.css';

// Before the first paint, so a dark-theme user never sees a white flash.
initTheme();

/**
 * Chưa đăng nhập thì về cổng VHKD, không hiện form riêng của OEM nữa.
 *
 * Quyết định TRƯỚC khi React vẽ, không phải trong App.jsx: đặt ở đó thì
 * LoginModal kịp hiện lên một nhịp rồi trang mới nhảy đi.
 *
 * bounceToPortal() trả false khi có lối thoát (?direct=1, hoặc vừa bị đá về
 * mà quay lại tay không) — lúc đó dựng app như cũ để form đăng nhập của OEM
 * vẫn là đường vào dự phòng khi Karofi ID hỏng.
 */
const signedIn = !!loadSession();
if (signedIn) clearBounceFlag();

if (signedIn || !bounceToPortal()) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
