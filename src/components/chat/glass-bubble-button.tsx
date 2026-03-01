'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';

/* ═══════════════════════════════════════════════════════════
   GlassBubbleButton — M3 flat pill button

   OLED:  selected = white bg + black font, deselected = dark gray
   Dark:  selected = pitch-dark bg, deselected = subtle warm fill
   Light: flat M3 — no shadow, no outline, light gray deselected,
          pitch black selected with white font
   Sunny: uses CSS variables
   ═══════════════════════════════════════════════════════════ */

type BubbleColor = 'violet' | 'ember' | 'green' | 'cyan' | 'red' | 'yellow' | 'neutral';

interface GlassBubbleButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  color?: BubbleColor;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

const SIZE_MAP = {
  sm: { padding: '0.35rem 0.75rem', fontSize: '0.75rem', gap: '0.375rem' },
  md: { padding: '0.4375rem 0.875rem', fontSize: '0.8125rem', gap: '0.375rem' },
  lg: { padding: '0.5rem 1rem', fontSize: '0.875rem', gap: '0.5rem' },
};

export function GlassBubbleButton({
  children,
  onClick,
  active = false,
  color = 'neutral',
  size = 'md',
  fullWidth = false,
  className,
  style: styleProp,
  disabled = false,
  type = 'button',
}: GlassBubbleButtonProps) {
  const { isDark, isOled, isSunny, isCosmic } = useIsDark();
  const [hovered, setHovered] = useState(false);

  const s = SIZE_MAP[size];
  const isDefaultLight = !isDark && !isSunny;

  // ── Background ──
  let bg: string;
  if (disabled) {
    bg = isOled ? 'rgba(30,30,30,0.6)'
      : isCosmic ? 'rgba(139,159,212,0.02)'
      : isDark ? 'rgba(244,189,111,0.02)'
      : isDefaultLight ? 'rgba(0,0,0,0.04)'
      : 'var(--secondary)';
  } else if (active) {
    bg = isOled ? 'rgba(255,255,255,0.95)'         // OLED: white pill
      : isCosmic ? 'rgba(22,20,38,0.92)'           // Cosmic: deep indigo
      : isDark ? 'rgba(16,13,10,0.92)'              // Dark: pitch dark
      : isDefaultLight ? '#000000'                    // Light: pitch black
      : 'var(--primary)';
  } else if (hovered) {
    bg = isOled ? 'rgba(50,50,50,0.8)'
      : isCosmic ? 'rgba(50,48,80,0.35)'
      : isDark ? 'rgba(55,50,45,0.35)'
      : isDefaultLight ? 'rgba(0,0,0,0.06)'
      : 'var(--secondary)';
  } else {
    bg = isOled ? 'rgba(35,35,35,0.7)'              // OLED: dark gray pill
      : isCosmic ? 'rgba(139,159,212,0.06)'          // Cosmic: subtle blue tint
      : isDark ? 'rgba(244,189,111,0.05)'
      : isDefaultLight ? 'rgba(0,0,0,0.04)'          // Light: light gray (M3 flat)
      : 'var(--card)';
  }

  // ── Text color ──
  let fg: string;
  if (disabled) {
    fg = isOled ? 'rgba(120,120,120,0.4)'
      : isCosmic ? 'rgba(155,150,175,0.35)'
      : isDark ? 'rgba(156,143,128,0.35)'
      : isDefaultLight ? 'rgba(0,0,0,0.25)'
      : 'var(--muted-foreground)';
  } else if (active) {
    fg = isOled ? 'rgba(0,0,0,0.92)'              // OLED: black on white
      : isCosmic ? 'rgba(200,195,225,0.95)'        // Cosmic: light lavender
      : isDark ? 'rgba(232,228,222,0.95)'
      : isDefaultLight ? '#FFFFFF'
      : 'var(--primary-foreground)';
  } else {
    fg = isOled ? 'rgba(200,200,200,0.85)'
      : isCosmic ? 'rgba(155,150,175,0.7)'          // Cosmic: muted indigo
      : isDark ? 'rgba(156,143,128,0.7)'
      : isDefaultLight ? 'rgba(0,0,0,0.6)'
      : 'var(--foreground)';
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: active ? 700 : 600,
        letterSpacing: '-0.01em',
        borderRadius: '9999px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : 'auto',
        border: 'none',                              // M3 flat: no borders anywhere
        background: bg,
        color: fg,
        boxShadow: 'none',                           // M3 flat: no shadows
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        transition: 'background 0.15s, color 0.15s, opacity 0.2s',
        opacity: disabled ? 0.35 : 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        ...styleProp,
      }}
    >
      {children}
    </motion.button>
  );
}
