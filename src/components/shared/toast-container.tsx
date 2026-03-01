'use client';

import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

const BORDER_COLORS: Record<string, string> = {
  info: '#5B8DEF',
  success: '#4CAF50',
  error: '#EF5B5B',
  warning: '#E5A440',
};

export function ToastContainer() {
  const toasts = usePFCStore((s) => s.toasts);
  const removeToast = usePFCStore((s) => s.removeToast);
  const { isDark } = useIsDark();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-toast)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.625rem 0.875rem',
              borderRadius: '0.75rem',
              borderLeft: `3px solid ${BORDER_COLORS[toast.type] ?? BORDER_COLORS.info}`,
              background: isDark
                ? 'rgba(22,21,19,0.75)'
                : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
              border: `1px solid ${isDark ? 'rgba(50,49,45,0.3)' : 'rgba(0,0,0,0.06)'}`,
              borderLeftColor: BORDER_COLORS[toast.type] ?? BORDER_COLORS.info,
              borderLeftWidth: '3px',
              borderLeftStyle: 'solid',
              boxShadow: isDark
                ? '0 4px 16px -2px rgba(0,0,0,0.4)'
                : '0 4px 20px -4px rgba(0,0,0,0.1)',
              pointerEvents: 'auto',
              maxWidth: '28rem',
              minWidth: '16rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1.5,
                color: isDark
                  ? 'rgba(232,228,222,0.9)'
                  : 'rgba(28,27,31,0.85)',
                flex: 1,
              }}
            >
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.25rem',
                height: '1.25rem',
                borderRadius: '9999px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                flexShrink: 0,
                color: isDark
                  ? 'rgba(155,150,137,0.5)'
                  : 'rgba(0,0,0,0.3)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isDark
                  ? 'rgba(232,228,222,0.9)'
                  : 'rgba(0,0,0,0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isDark
                  ? 'rgba(155,150,137,0.5)'
                  : 'rgba(0,0,0,0.3)';
              }}
            >
              <XIcon style={{ height: '0.75rem', width: '0.75rem' }} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
