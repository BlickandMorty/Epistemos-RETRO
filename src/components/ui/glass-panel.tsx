'use client';

/**
 * GlassPanel — Shared glass-morphism container
 *
 * Consolidates the repeated glass-card pattern used across 15+ components.
 * Supports multiple variants through a discriminated-union style approach:
 * - 'float' — fixed-position floating panel (mini-chat, tooltips)
 * - 'card'  — inline card in the page flow (settings cards, signal panels)
 * - 'modal' — centered overlay with backdrop
 *
 * All variants share: backdrop-filter blur, semi-transparent bg,
 * subtle border, rounded corners, and theme awareness.
 */

import { forwardRef, type CSSProperties, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────

export type GlassPanelVariant = 'float' | 'card' | 'modal';

export interface GlassPanelProps {
  children: ReactNode;
  variant?: GlassPanelVariant;
  isDark?: boolean;
  /** Border radius (default: 16) */
  radius?: number;
  /** Blur intensity (default: 20) */
  blur?: number;
  /** Background opacity multiplier 0-1 (default: 0.92) */
  opacity?: number;
  /** Additional styles */
  style?: CSSProperties;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}

// ─── Component ───────────────────────────────────────────────────

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel(
    {
      children,
      variant = 'card',
      isDark = false,
      radius = 16,
      blur = 20,
      opacity = 0.92,
      style,
      className,
      ...handlers
    },
    ref,
  ) {
    const bg = isDark
      ? `rgba(18, 18, 22, ${opacity})`
      : `rgba(255, 255, 255, ${opacity})`;
    const border = isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.08)';
    const shadow = isDark
      ? '0 8px 32px -4px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)'
      : '0 8px 32px -4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)';

    const baseStyle: CSSProperties = {
      background: bg,
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      border: `1px solid ${border}`,
      borderRadius: radius,
      boxShadow: shadow,
      overflow: 'hidden',
    };

    // Variant-specific overrides
    if (variant === 'float') {
      Object.assign(baseStyle, {
        position: 'fixed' as const,
        zIndex: 9999,
      });
    } else if (variant === 'modal') {
      Object.assign(baseStyle, {
        position: 'fixed' as const,
        zIndex: 10000,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      });
    }

    return (
      <div ref={ref} style={{ ...baseStyle, ...style }} className={className} {...handlers}>
        {children}
      </div>
    );
  },
);
