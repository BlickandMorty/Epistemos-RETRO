import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { THEME_LIST } from '@/hooks/use-theme';
import { AppShell } from '@/components/layout/app-shell';
import { setupTauriListeners } from '@/lib/tauri-bridge';
import { initWasm } from '@/lib/wasm-loader';
import '@/styles/globals.css';

// ── Lazy page components — code-split per route ──
const LandingPage = lazy(() => import('@/pages/landing'));
const ChatPage = lazy(() => import('@/pages/chat'));
const NotesPage = lazy(() => import('@/pages/notes'));
const LibraryPage = lazy(() => import('@/pages/library'));
const GraphPage = lazy(() => import('@/pages/graph'));
const SettingsPage = lazy(() => import('@/pages/settings'));

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    // Load custom Rust UI physics WASM solver
    initWasm().catch(console.error);

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
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="dark" themes={THEME_LIST}>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
