import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '@/core/i18n';
import * as i18nModule from 'i18next';
const i18n = (i18nModule as any).default || i18nModule;
import App from './App.tsx';
import './index.css';

type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    hasError: boolean;
    message: string;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
        message: '',
    };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.error('[SupplyOS] React render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const t = i18n.getFixedT(i18n.language || 'en');
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
                    <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Supply OS</p>
                        <h1 className="mt-2 text-xl font-extrabold">{t("errorBoundaryTitle")}</h1>
                        <p className="mt-2 text-sm text-slate-500">
                            {t("errorBoundaryDesc")}
                        </p>
                        {this.state.message && (
                            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                                {this.state.message}
                            </pre>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                window.location.href = '/showroom';
                            }}
                            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                        >
                            {t("errorBoundaryBackHome")}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <LocaleProvider>
                <App />
            </LocaleProvider>
        </ErrorBoundary>
    </StrictMode>,
);
