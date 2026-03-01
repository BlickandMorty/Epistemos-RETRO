import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { AppShell } from '@/components/layout/app-shell';
import { setupTauriListeners } from '@/lib/tauri-bridge';
import '@/styles/globals.css';

// ── Lazy page components — code-split per route ──
const LandingPage = lazy(() => import('@/pages/landing'));
const ChatPage = lazy(() => import('@/pages/chat'));
const NotesPage = lazy(() => import('@/pages/notes'));
const LibraryPage = lazy(() => import('@/pages/library'));
const AnalyticsPage = lazy(() => import('@/pages/analytics'));
const DaemonPage = lazy(() => import('@/pages/daemon'));
const SettingsPage = lazy(() => import('@/pages/settings'));

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    setupTauriListeners().then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        cleanup = unlisten;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <AppShell>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/daemon" element={<DaemonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" themes={['light', 'dark', 'oled', 'cosmic', 'sunny', 'sunset']}>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
