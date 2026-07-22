import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider } from '@/core/i18n';
import { AuthProvider } from '@/core/auth';
import { ErrorBoundary } from '@/shared/ui';
import App from './App.tsx';
import './index.css';

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
