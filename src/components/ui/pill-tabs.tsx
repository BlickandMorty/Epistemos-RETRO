'use client';

/**
 * PillTabs — Shared polymorphic tab bar component
 *
 * A discriminated-union approach: one component renders tab bars
 * across the entire app with consistent styling. Supports:
 * - Pill/capsule style (default) — rounded individual tabs
 * - Underline style — bottom-border active indicator
 * - Icon-only, icon+label, and label-only modes
 *
 * Usage:
 *   <PillTabs tabs={[...]} active={id} onSelect={setId} />
 */

import { memo, useCallback, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Optional accent color dot */
  dot?: string;
  /** If true, tab is disabled */
  disabled?: boolean;
}

export type TabVariant = 'pill' | 'underline';

export interface PillTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** Visual variant (default: 'pill') */
  variant?: TabVariant;
  /** Dark mode flag */
  isDark?: boolean;
  /** Compact sizing (default: false) */
  compact?: boolean;
  /** Additional container styles */
  style?: CSSProperties;
  /** Container className */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────

function PillTabsInner<T extends string>({
  tabs,
  active,
  onSelect,
  variant = 'pill',
  isDark = false,
  compact = false,
  style,
  className,
}: PillTabsProps<T>) {
  const fontSize = compact ? 10.5 : 12;
  const pad = compact ? '3px 8px' : '4px 12px';
  const gap = compact ? 3 : 4;
  const iconSize = compact ? 11 : 13;

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap,
    flexShrink: 0,
    ...style,
  };

  return (
    <div style={containerStyle} className={className}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <TabButton
            key={tab.id}
            isActive={isActive}
            isDark={isDark}
            variant={variant}
            fontSize={fontSize}
            pad={pad}
            iconSize={iconSize}
            icon={Icon}
            label={tab.label}
            dot={tab.dot}
            disabled={tab.disabled}
            onClick={() => onSelect(tab.id)}
          />
        );
      })}
    </div>
  );
}

// Memoized tab button to prevent re-renders
const TabButton = memo(function TabButton({
  isActive,
  isDark,
  variant,
  fontSize,
  pad,
  iconSize,
  icon: Icon,
  label,
  dot,
  disabled,
  onClick,
}: {
  isActive: boolean;
  isDark: boolean;
  variant: TabVariant;
  fontSize: number;
  pad: string;
  iconSize: number;
  icon?: LucideIcon;
  label: string;
  dot?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const handleClick = useCallback(() => {
    if (!disabled) onClick();
  }, [disabled, onClick]);

  const accentRgb = 'var(--pfc-accent-rgb)';
  const accent = 'var(--pfc-accent)';

  const isPill = variant === 'pill';
  const activeBg = isPill
    ? `rgba(${accentRgb}, ${isDark ? '0.15' : '0.1'})`
    : 'transparent';
  const inactiveBg = 'transparent';
  const activeColor = accent;
  const inactiveColor = isDark ? 'rgba(155,150,137,0.7)' : 'rgba(0,0,0,0.4)';
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: pad,
    borderRadius: isPill ? 999 : 0,
    // Use longhand border properties to avoid React shorthand/non-shorthand conflict
    borderTop: isPill ? `1px solid ${isActive ? `${accent}33` : 'transparent'}` : 'none',
    borderRight: isPill ? `1px solid ${isActive ? `${accent}33` : 'transparent'}` : 'none',
    borderLeft: isPill ? `1px solid ${isActive ? `${accent}33` : 'transparent'}` : 'none',
    borderBottom: isPill
      ? `1px solid ${isActive ? `${accent}33` : 'transparent'}`
      : (isActive ? `2px solid ${accent}` : '2px solid transparent'),
    background: isActive ? activeBg : inactiveBg,
    color: isActive ? activeColor : inactiveColor,
    fontSize,
    fontWeight: isActive ? 600 : 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.15s ease',
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'nowrap',
  };

  return (
    <button onClick={handleClick} style={style}>
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      )}
      {Icon && <Icon style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />}
      {label}
    </button>
  );
});

// Export with generic type preserved
export const PillTabs = PillTabsInner as <T extends string>(props: PillTabsProps<T>) => React.JSX.Element;
