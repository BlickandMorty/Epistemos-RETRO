'use client';

import { useState, useEffect, useRef } from 'react';
import type { BlockType } from '@/lib/notes/types';
import {
  PlusIcon,
  ChevronRightIcon,
  CheckSquareIcon,
  QuoteIcon,
  CodeIcon,
  MinusIcon,
  AlertCircleIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  SparklesIcon,
  BookOpenIcon,
  ExpandIcon,
  PenLineIcon,
  ImageIcon,
  TableIcon,
  FrameIcon,
  LinkIcon,
  SigmaIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  HighlighterIcon,
  CodeXmlIcon,
  ScissorsIcon,
  ClipboardIcon,
  ClipboardPasteIcon,
  Trash2Icon,
  RemoveFormattingIcon,
  PilcrowIcon,
  type LucideIcon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// BlockContextMenu — Craft/Obsidian-style right-click menu
// Replaces the floating toolbar with a full context menu system
// ═══════════════════════════════════════════════════════════════════

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  disabled?: boolean;
}

export function BlockContextMenu({
  position,
  isDark,
  onClose,
  onFormat,
  onChangeType,
  onInsert,
  onDelete,
  onPageLink,
  onAI,
  currentBlockType,
}: {
  position: { x: number; y: number };
  isDark: boolean;
  onClose: () => void;
  onFormat: (command: string) => void;
  onChangeType: (type: BlockType, props?: Record<string, string>) => void;
  onInsert: (type: string) => void;
  onDelete: () => void;
  onPageLink?: () => void;
  onAI?: (action: string) => void;
  currentBlockType: BlockType;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClick);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [onClose]);

  // Clamp menu position to viewport
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(position.x, window.innerWidth - rect.width - 8);
    const y = Math.min(position.y, window.innerHeight - rect.height - 8);
    setMenuStyle({ top: Math.max(4, y), left: Math.max(4, x) });
  }, [position]);

  const handleCut = () => { document.execCommand('cut'); onClose(); };
  const handleCopy = () => { document.execCommand('copy'); onClose(); };
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand('insertText', false, text);
    } catch { document.execCommand('paste'); }
    onClose();
  };
  const handleSelectAll = () => {
    const sel = window.getSelection();
    const blockEl = sel?.anchorNode?.parentElement?.closest('[data-block-id]');
    if (blockEl) {
      const range = document.createRange();
      range.selectNodeContents(blockEl);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    onClose();
  };

  // Menu definitions
  const formatSubmenu: ContextMenuItem[] = [
    { id: 'bold', label: 'Bold', icon: BoldIcon, shortcut: '\u2318B', action: () => { onFormat('bold'); onClose(); } },
    { id: 'italic', label: 'Italic', icon: ItalicIcon, shortcut: '\u2318I', action: () => { onFormat('italic'); onClose(); } },
    { id: 'underline', label: 'Underline', icon: UnderlineIcon, shortcut: '\u2318U', action: () => { onFormat('underline'); onClose(); } },
    { id: 'strikethrough', label: 'Strikethrough', icon: StrikethroughIcon, shortcut: '\u2318\u21E7S', action: () => { onFormat('strikethrough'); onClose(); } },
    { id: 'sep1', label: '', separator: true },
    { id: 'code', label: 'Inline Code', icon: CodeXmlIcon, shortcut: '\u2318E', action: () => { onFormat('inlineCode'); onClose(); } },
    { id: 'highlight', label: 'Highlight', icon: HighlighterIcon, shortcut: '\u2318\u21E7H', action: () => { onFormat('highlight'); onClose(); } },
    { id: 'sep2', label: '', separator: true },
    { id: 'clear', label: 'Clear Formatting', icon: RemoveFormattingIcon, action: () => { document.execCommand('removeFormat'); onClose(); } },
  ];

  const turnIntoSubmenu: ContextMenuItem[] = [
    { id: 'paragraph', label: 'Text', icon: PilcrowIcon, action: () => { onChangeType('paragraph'); onClose(); }, disabled: currentBlockType === 'paragraph' },
    { id: 'h1', label: 'Heading 1', icon: Heading1Icon, action: () => { onChangeType('heading', { level: '1' }); onClose(); } },
    { id: 'h2', label: 'Heading 2', icon: Heading2Icon, action: () => { onChangeType('heading', { level: '2' }); onClose(); } },
    { id: 'h3', label: 'Heading 3', icon: Heading3Icon, action: () => { onChangeType('heading', { level: '3' }); onClose(); } },
    { id: 'sep1', label: '', separator: true },
    { id: 'bullet', label: 'Bullet List', icon: ListIcon, action: () => { onChangeType('list-item'); onClose(); }, disabled: currentBlockType === 'list-item' },
    { id: 'numbered', label: 'Numbered List', icon: ListOrderedIcon, action: () => { onChangeType('numbered-item'); onClose(); }, disabled: currentBlockType === 'numbered-item' },
    { id: 'todo', label: 'To-do', icon: CheckSquareIcon, action: () => { onChangeType('todo', { checked: 'false' }); onClose(); }, disabled: currentBlockType === 'todo' },
    { id: 'sep2', label: '', separator: true },
    { id: 'quote', label: 'Quote', icon: QuoteIcon, action: () => { onChangeType('quote'); onClose(); }, disabled: currentBlockType === 'quote' },
    { id: 'callout', label: 'Callout', icon: AlertCircleIcon, action: () => { onChangeType('callout'); onClose(); }, disabled: currentBlockType === 'callout' },
    { id: 'code-block', label: 'Code Block', icon: CodeIcon, action: () => { onChangeType('code'); onClose(); }, disabled: currentBlockType === 'code' },
    { id: 'toggle', label: 'Toggle', icon: ChevronRightIcon, action: () => { onChangeType('toggle'); onClose(); }, disabled: currentBlockType === 'toggle' },
  ];

  const insertSubmenu: ContextMenuItem[] = [
    { id: 'divider', label: 'Divider', icon: MinusIcon, action: () => { onInsert('divider'); onClose(); } },
    { id: 'page-break', label: 'Page Break', icon: MinusIcon, action: () => { onInsert('page-break'); onClose(); } },
    { id: 'sep1', label: '', separator: true },
    { id: 'table', label: 'Table', icon: TableIcon, action: () => { onInsert('table'); onClose(); } },
    { id: 'image', label: 'Image', icon: ImageIcon, action: () => { onInsert('image'); onClose(); } },
    { id: 'math', label: 'Math Block', icon: SigmaIcon, action: () => { onInsert('math'); onClose(); } },
    { id: 'embed', label: 'Embed Page', icon: FrameIcon, action: () => { onInsert('embed'); onClose(); } },
    { id: 'sep2', label: '', separator: true },
    { id: 'page-link', label: 'Page Link [[...]]', icon: LinkIcon, action: () => { onPageLink?.(); onClose(); } },
  ];

  const aiSubmenu: ContextMenuItem[] = [
    { id: 'ai-continue', label: 'Continue Writing', icon: SparklesIcon, action: () => { onAI?.('ai-continue'); onClose(); } },
    { id: 'ai-summarize', label: 'Summarize Page', icon: BookOpenIcon, action: () => { onAI?.('ai-summarize'); onClose(); } },
    { id: 'ai-expand', label: 'Expand Block', icon: ExpandIcon, action: () => { onAI?.('ai-expand'); onClose(); } },
    { id: 'ai-rewrite', label: 'Rewrite Block', icon: PenLineIcon, action: () => { onAI?.('ai-rewrite'); onClose(); } },
  ];

  const menuItems: ContextMenuItem[] = [
    { id: 'format', label: 'Format', icon: BoldIcon, submenu: formatSubmenu },
    { id: 'turn-into', label: 'Turn into', icon: PilcrowIcon, submenu: turnIntoSubmenu },
    { id: 'insert', label: 'Insert below', icon: PlusIcon, submenu: insertSubmenu },
    { id: 'ai', label: 'AI', icon: SparklesIcon, submenu: aiSubmenu },
    { id: 'sep-actions', label: '', separator: true },
    { id: 'cut', label: 'Cut', icon: ScissorsIcon, shortcut: '\u2318X', action: handleCut },
    { id: 'copy', label: 'Copy', icon: ClipboardIcon, shortcut: '\u2318C', action: handleCopy },
    { id: 'paste', label: 'Paste', icon: ClipboardPasteIcon, shortcut: '\u2318V', action: handlePaste },
    { id: 'select-all', label: 'Select All', shortcut: '\u2318A', action: handleSelectAll },
    { id: 'sep-delete', label: '', separator: true },
    { id: 'delete', label: 'Delete Block', icon: Trash2Icon, action: () => { onDelete(); onClose(); } },
  ];

  const bg = isDark ? 'rgba(28,24,20,0.96)' : 'rgba(255,255,255,0.98)';
  const border = isDark ? 'rgba(79,69,57,0.45)' : 'rgba(0,0,0,0.06)';
  const hoverBg = isDark ? 'rgba(var(--pfc-accent-rgb), 0.1)' : 'rgba(0,0,0,0.04)';
  const textColor = isDark ? 'rgba(232,228,222,0.85)' : 'rgba(0,0,0,0.7)';
  const subtleColor = isDark ? 'rgba(232,228,222,0.38)' : 'rgba(0,0,0,0.32)';
  const dangerColor = isDark ? '#E07850' : '#C44030';
  const sepColor = isDark ? 'rgba(79,69,57,0.35)' : 'rgba(0,0,0,0.06)';

  const handleSubmenuEnter = (itemId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setSubmenuPos({ top: rect.top - 4, left: rect.right + 2 });
    hoverTimerRef.current = setTimeout(() => setOpenSubmenu(itemId), 80);
  };

  const handleSubmenuLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setOpenSubmenu(null), 200);
  };

  const renderMenuItem = (item: ContextMenuItem, inSubmenu = false) => {
    if (item.separator) {
      return <div key={item.id} style={{ height: 1, margin: '4px 8px', background: sepColor }} />;
    }

    const hasSubmenu = !!item.submenu;
    const isDelete = item.id === 'delete';
    const Icon = item.icon;

    return (
      <div
        key={item.id}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus theft from contentEditable
        onClick={item.disabled ? undefined : item.action}
        onMouseEnter={(e) => {
          if (item.disabled) return;
          (e.currentTarget as HTMLElement).style.background = hoverBg;
          if (hasSubmenu) handleSubmenuEnter(item.id, e);
          else {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (!inSubmenu) hoverTimerRef.current = setTimeout(() => setOpenSubmenu(null), 200);
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          if (hasSubmenu) handleSubmenuLeave();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.38rem 0.6rem 0.38rem 0.55rem',
          borderRadius: '6px',
          cursor: item.disabled ? 'default' : 'pointer',
          color: item.disabled ? subtleColor : isDelete ? dangerColor : textColor,
          fontSize: '0.78rem',
          fontWeight: 520,
          letterSpacing: '-0.005em',
          opacity: item.disabled ? 0.5 : 1,
          transition: 'background 0.08s',
          position: 'relative',
        }}
      >
        {Icon && <Icon style={{ width: 14, height: 14, strokeWidth: 2, opacity: 0.7, flexShrink: 0 }} />}
        <span style={{ flex: 1, lineHeight: 1 }}>{item.label}</span>
        {item.shortcut && (
          <span style={{
            fontSize: '0.66rem', fontWeight: 500, color: subtleColor,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
          }}>{item.shortcut}</span>
        )}
        {hasSubmenu && (
          <ChevronRightIcon style={{ width: 12, height: 12, strokeWidth: 2.2, opacity: 0.4, marginLeft: 'auto' }} />
        )}
      </div>
    );
  };

  const renderSubmenu = (items: ContextMenuItem[]) => (
    <div
      onMouseDown={(e) => e.preventDefault()} // Prevent focus theft from contentEditable
      onMouseEnter={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }}
      onMouseLeave={handleSubmenuLeave}
      style={{
        position: 'fixed',
        top: Math.min(submenuPos.top, window.innerHeight - 320),
        left: Math.min(submenuPos.left, window.innerWidth - 220),
        width: '13.5rem',
        maxHeight: '22rem',
        overflowY: 'auto',
        padding: '4px',
        borderRadius: '10px',
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        zIndex: 'var(--z-modal)',
        animation: 'ctx-sub-in 0.1s cubic-bezier(0.32, 0.72, 0, 1)',
        scrollbarWidth: 'thin',
        scrollbarColor: isDark ? 'rgba(79,69,57,0.3) transparent' : 'rgba(0,0,0,0.08) transparent',
      }}
    >
      {items.map((item) => renderMenuItem(item, true))}
    </div>
  );

  return (
    <div ref={menuRef} onMouseDown={(e) => e.preventDefault()} style={{ display: 'contents' }}>
      <div
        onMouseDown={(e) => e.preventDefault()} // Prevent focus theft from contentEditable
        style={{
          position: 'fixed',
          ...menuStyle,
          width: '14.5rem',
          padding: '4px',
          borderRadius: '10px',
          background: bg,
          border: `1px solid ${border}`,
          boxShadow: isDark
            ? '0 12px 48px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.35)'
            : '0 12px 48px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.07)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          zIndex: 'var(--z-modal)',
          animation: 'ctx-menu-in 0.12s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {menuItems.map((item) => renderMenuItem(item))}
      </div>

      {/* Render submenu — inside menuRef so outside-click detection works */}
      {openSubmenu && (() => {
        const parent = menuItems.find(i => i.id === openSubmenu);
        return parent?.submenu ? renderSubmenu(parent.submenu) : null;
      })()}

      <style>{`
        @keyframes ctx-menu-in {
          from { opacity: 0; transform: scale(0.96) translateY(-2px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ctx-sub-in {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
