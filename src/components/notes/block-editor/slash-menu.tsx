'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { SlashCommand } from '@/lib/notes/types';
import { SLASH_COMMANDS, SLASH_CATEGORIES } from '@/lib/notes/types';
import {
  PlusIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  CheckSquareIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  CodeIcon,
  MinusIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  SigmaIcon,
  TableIcon,
  ImageIcon,
  FrameIcon,
  LinkIcon,
  SparklesIcon,
  BookOpenIcon,
  ExpandIcon,
  PenLineIcon,
  TypeIcon,
  type LucideIcon,
} from 'lucide-react';

// ── Icon map ──
const ICON_MAP: Record<string, LucideIcon> = {
  'heading-1': Heading1Icon, 'heading-2': Heading2Icon, 'heading-3': Heading3Icon,
  'check-square': CheckSquareIcon, 'list': ListIcon, 'list-ordered': ListOrderedIcon,
  'quote': QuoteIcon, 'code': CodeIcon, 'minus': MinusIcon, 'alert-circle': AlertCircleIcon,
  'chevron-right': ChevronRightIcon, 'sigma': SigmaIcon, 'table': TableIcon,
  'image': ImageIcon, 'frame': FrameIcon, 'link': LinkIcon, 'sparkles': SparklesIcon,
  'book-open': BookOpenIcon, 'expand': ExpandIcon, 'pen-line': PenLineIcon, 'type': TypeIcon,
};

// ═══════════════════════════════════════════════════════════════════
// SlashMenu — command palette triggered by /
// Categorized like SiYuan with keyword search
// ═══════════════════════════════════════════════════════════════════

export function SlashMenu({
  query,
  position,
  isDark,
  onSelect,
  onClose,
  selectedIndex,
}: {
  query: string;
  position: { top: number; left: number };
  isDark: boolean;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  selectedIndex: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.keywords.some((kw) => kw.includes(q)),
    );
  }, [query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: string; label: string; items: SlashCommand[] }[] = [];
    for (const cat of SLASH_CATEGORIES) {
      const items = filtered.filter((c) => c.category === cat.id);
      if (items.length > 0) groups.push({ category: cat.id, label: cat.label, items });
    }
    return groups;
  }, [filtered]);

  // Flip upward if not enough space below
  useEffect(() => {
    const menuMaxH = 22 * 16; // 22rem in px
    const spaceBelow = window.innerHeight - position.top;
    setFlipped(spaceBelow < menuMaxH && position.top > menuMaxH);
  }, [position.top]);

  // Scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const el = menuRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  let flatIdx = -1;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        ...(flipped
          ? { bottom: window.innerHeight - position.top + 8, left: position.left }
          : { top: position.top, left: position.left }),
        zIndex: 'var(--z-modal)',
        width: '18rem',
        maxHeight: '22rem',
        overflowY: 'auto',
        borderRadius: '12px',
        background: isDark ? 'rgba(40,36,30,0.95)' : 'rgba(255,255,255,0.97)',
        border: `1px solid ${isDark ? 'rgba(79,69,57,0.4)' : 'rgba(0,0,0,0.05)'}`,
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.5)'
          : '0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '6px',
        backdropFilter: 'blur(20px) saturate(1.5)',
        animation: 'toolbar-in 0.12s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {grouped.map((group) => (
        <div key={group.category}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: isDark ? 'rgba(155,150,137,0.4)' : 'rgba(0,0,0,0.25)',
            padding: '6px 8px 4px',
            fontFamily: 'var(--font-sans)',
          }}>
            {group.label}
          </div>
          {group.items.map((cmd) => {
            flatIdx++;
            const isSelected = flatIdx === selectedIndex;
            const Icon = ICON_MAP[cmd.icon] ?? PlusIcon;
            return (
              <button
                key={cmd.id}
                data-selected={isSelected ? 'true' : undefined}
                onClick={() => onSelect(cmd)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: isSelected
                    ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.12)' : 'rgba(var(--pfc-accent-rgb), 0.08)')
                    : 'transparent',
                  color: isDark ? 'rgba(232,228,222,0.9)' : 'rgba(0,0,0,0.8)',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{
                  width: '24px', height: '24px', borderRadius: '6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(0,0,0,0.04)',
                  flexShrink: 0,
                }}>
                  <Icon style={{ width: '13px', height: '13px', color: 'var(--pfc-accent)' }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{cmd.label}</div>
                  <div style={{
                    fontSize: '0.6875rem',
                    color: isDark ? 'rgba(155,150,137,0.5)' : 'rgba(0,0,0,0.35)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {cmd.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
