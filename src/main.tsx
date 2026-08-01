import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider } from '@/core/i18n';
import { AuthProvider } from '@/core/auth';
import { ErrorBoundary } from '@/shared/ui';
import App from './App.tsx';
import './index.css';

// ── 部署更新兑底：动态 chunk 加载失败时自动重载 ──
// 部署后旧哈希文件名已不存在，用户导航到新页面时 import() 会报 ChunkLoadError。
// 此时自动刷新即可加载最新资源，用户完全无感知。
const RELOAD_KEY = 'supply-os:auto-reload';
window.addEventListener('error', (event) => {
  const err = event.error;
  if (err && (err.name === 'ChunkLoadError' || /Loading chunk/i.test(err.message || ''))) {
    // 防止无限循环：同一会话只自动刷新一次
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <LocaleProvider>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </LocaleProvider>
            </BrowserRouter>
        </ErrorBoundary>
    </StrictMode>,
);
