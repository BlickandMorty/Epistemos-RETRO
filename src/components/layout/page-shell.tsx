'use client';

import type { LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { useIsDark } from '@/hooks/use-is-dark';
import { useTypewriter } from '@/hooks/use-typewriter';
import { motion } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════
   PageShell — full-bleed immersive page wrapper

   Replaces the old card-based layout with a clean, borderless
   flow. Content is structured through typography hierarchy
   and spacing instead of glass cards.
   ═══════════════════════════════════════════════════════════ */

/** Pages reachable from the main nav — no back button needed */
const MAIN_NAV_PATHS = ['/', '/notes', '/library', '/analytics', '/daemon', '/settings'];

interface PageShellProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** When true, omits the outer height:100vh container and page header.
   *  Used when rendered inside the analytics hub which has its own chrome. */
  embedded?: boolean;
  /** Explicit back URL. If omitted, auto-detects: sub-pages get a back button, main-nav pages don't. */
  backHref?: string;
}

import { M3_EASE } from '@/lib/motion/motion-config';

const headerVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: M3_EASE },
  },
};

const contentVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.08 },
  },
};

export function PageShell({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  children,
  embedded,
  backHref,
}: PageShellProps) {
  const { isDark, isOled } = useIsDark();
  const pathname = usePathname();
  const router = useRouter();
  // Auto-detect embedded mode when rendered inside the analytics hub
  const isEmbedded = embedded || pathname === '/analytics';
  // Always show header — in embedded mode it's compact
  const showHeader = true;
  // Show back button on sub-pages (not in main nav) unless embedded
  const showBack = !isEmbedded && (backHref != null || !MAIN_NAV_PATHS.includes(pathname));
  const { displayText: titleText, cursorVisible: titleCursor } = useTypewriter(title, showHeader, {
    speed: 25,
    startDelay: 50,
    cursorLingerMs: 500,
  });

  return (
    <div
      style={{
        ...(isEmbedded ? {} : { height: '100vh', overflow: 'hidden' }),
        display: 'flex',
        flexDirection: 'column',
        background: isEmbedded ? 'transparent' : 'var(--chat-surface)',
        color: 'var(--foreground)',
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: isEmbedded ? undefined : 'auto',
          maxWidth: '56rem',
          marginLeft: 'auto',
          marginRight: 'auto',
          padding: isEmbedded ? '1rem 2rem 4rem 2rem' : '6.5rem 2rem 4rem 4rem',
          width: '100%',
          ...(isEmbedded ? {} : {
            willChange: 'scroll-position',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }),
          contain: 'layout style paint',
          transform: 'translateZ(0)',
        } as React.CSSProperties}
      >
        {/* ── Page header (hidden when embedded in analytics hub) ── */}
        <motion.div
          variants={headerVariants}
          initial="hidden"
          animate="visible"
          style={{ marginBottom: isEmbedded ? '1rem' : '3rem', transform: 'translateZ(0)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isEmbedded ? '0.75rem' : '1.25rem', marginBottom: '0.25rem' }}>
            {/* Back button for sub-pages */}
            {showBack && (
              <button
                onClick={() => backHref ? router.push(backHref) : router.back()}
                aria-label="Go back"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '2.25rem',
                  width: '2.25rem',
                  borderRadius: '0.625rem',
                  border: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                  background: isOled ? 'rgba(25,25,25,0.6)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  color: isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.35)',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
                  e.currentTarget.style.color = isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isOled ? 'rgba(25,25,25,0.6)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
                  e.currentTarget.style.color = isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.35)';
                }}
                title="Go back"
              >
                <ArrowLeftIcon style={{ height: '1rem', width: '1rem' }} />
              </button>
            )}
            <div
              style={{
                display: 'flex',
                height: isEmbedded ? '2.25rem' : '3.5rem',
                width: isEmbedded ? '2.25rem' : '3.5rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: isEmbedded ? '0.625rem' : '1rem',
                flexShrink: 0,
                background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'var(--pfc-accent-light)' : 'rgba(0,0,0,0.04)',
              }}
            >
              <Icon
                style={{
                  height: isEmbedded ? '1.125rem' : '1.75rem',
                  width: isEmbedded ? '1.125rem' : '1.75rem',
                  color: iconColor || 'var(--pfc-accent)',
                }}
              />
            </div>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: isEmbedded ? '1.375rem' : '2.25rem',
                  fontWeight: 400,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {titleText}
                {titleCursor && (
                  <span style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '2rem',
                    backgroundColor: 'var(--pfc-accent)',
                    marginLeft: '2px',
                    flexShrink: 0,
                    opacity: 0.8,
                  }} />
                )}
              </h1>
              {subtitle && (
                <p
                  style={{
                    fontSize: '1rem',
                    marginTop: '0.25rem',
                    color: isOled ? 'rgba(140,140,140,0.9)' : isDark ? 'rgba(156,143,128,0.9)' : 'rgba(0,0,0,0.4)',
                    lineHeight: 1.5,
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Content flow ── */}
        <motion.div
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', transform: 'translateZ(0)' }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Section — lightweight content grouping

   No card/glass wrapper. Uses a subtle top border and
   typography to define sections. Clean and minimal.
   ═══════════════════════════════════════════════════════════ */

interface SectionProps {
  title?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const sectionVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: M3_EASE },
  },
};

export function Section({ title, badge, children, className }: SectionProps) {
  const { isDark, isOled } = useIsDark();

  return (
    <motion.div
      variants={sectionVariants}
      className={className}
      style={{
        transform: 'translateZ(0)',
        contain: 'layout style',
        /* M3 flat tonal surface — OLED gets dark grey, others get subtle fill */
        background: isOled
          ? 'rgba(18,18,18,0.75)'
          : isDark
            ? 'rgba(255,255,255,0.02)'
            : 'rgba(0,0,0,0.015)',
        borderRadius: '1.25rem',
        padding: '1.5rem',
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            paddingBottom: '0.75rem',
            borderBottom: 'none',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.125rem',
              fontWeight: 400,
              letterSpacing: '-0.01em',
              color: isOled ? 'rgba(220,220,220,0.9)' : isDark ? 'rgba(237,224,212,0.9)' : 'rgba(0,0,0,0.75)',
            }}
          >
            {title}
          </h2>
          {badge}
        </div>
      )}
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Backward-compat alias — so existing code doesn't break
   while we migrate all pages
   ═══════════════════════════════════════════════════════════ */

export function GlassSection(props: SectionProps) {
  return <Section {...props} />;
}
