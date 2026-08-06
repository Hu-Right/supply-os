import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider, setupI18nSync } from '@/core/i18n';
import { AuthProvider } from '@/core/auth';
import { ErrorBoundary } from '@/shared/ui';
import { initPerfMonitor } from '@/core/perf';
import App from './App.tsx';
import './index.css';

// ── 性能监控初始化 ──
initPerfMonitor();

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

// ── i18n 非阻塞渲染优化：同步初始化引擎 → 立即挂载 React → LocaleProvider 内部异步加载语言包 ──
// P0 性能优化：消除 initI18n() 对首屏渲染的阻塞（预计快 200-500ms）
// 回滚：恢复为 initI18n().then(() => { createRoot(...) })
setupI18nSync();

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
