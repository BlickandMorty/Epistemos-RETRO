/* ═══════════════════════════════════════════════════════════════════
   DiffView — GitHub-style diff viewer
   
   Unified or split view for comparing two versions. Shows line-level
   changes with word-level highlighting for modifications.
   ═══════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LineDiff, DiffSection, IndexedLine } from '@/lib/bindings';

// ── Types ──────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: LineDiff;
  sections: DiffSection[];
  viewMode: 'unified' | 'split';
  contextLines?: number;
}

interface DiffLineProps {
  line: IndexedLine;
  lineNumber: number;
}

// ── Colors ─────────────────────────────────────────────────────────

const diffColors = {
  added: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    wordBg: 'bg-green-300 dark:bg-green-700/50',
  },
  removed: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    wordBg: 'bg-red-300 dark:bg-red-700/50',
  },
  modified: {
    bg: 'bg-amber-100 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
  unchanged: {
    bg: 'transparent',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

// ── Helpers ────────────────────────────────────────────────────────

function getLinePrefix(line: IndexedLine): string {
  switch (line.kind) {
    case 'Unchanged':
      return ' ';
    case 'Added':
      return '+';
    case 'Removed':
      return '-';
    case 'Modified':
      return '~';
    default:
      return ' ';
  }
}

function getLineBgColor(line: IndexedLine): string {
  switch (line.kind) {
    case 'Unchanged':
      return diffColors.unchanged.bg;
    case 'Added':
      return diffColors.added.bg;
    case 'Removed':
      return diffColors.removed.bg;
    case 'Modified':
      return diffColors.modified.bg;
    default:
      return '';
  }
}

function getLineTextColor(line: IndexedLine): string {
  switch (line.kind) {
    case 'Unchanged':
      return diffColors.unchanged.text;
    case 'Added':
      return diffColors.added.text;
    case 'Removed':
      return diffColors.removed.text;
    case 'Modified':
      return diffColors.modified.text;
    default:
      return '';
  }
}

// ── Components ─────────────────────────────────────────────────────

function UnifiedDiffLine({ line, lineNumber }: DiffLineProps) {
  const prefix = getLinePrefix(line);
  const bgColor = getLineBgColor(line);
  const textColor = getLineTextColor(line);

  const content = useMemo(() => {
    switch (line.kind) {
      case 'Unchanged':
        return <span>{line.content}</span>;
      case 'Added':
        return <span>{line.content}</span>;
      case 'Removed':
        return <span>{line.content}</span>;
      case 'Modified':
        return (
          <div className="flex flex-col gap-0.5">
            <span className={diffColors.removed.text}>{line.content.old}</span>
            <span className={diffColors.added.text}>{line.content.new}</span>
          </div>
        );
      default:
        return null;
    }
  }, [line]);

  return (
    <div
      className={`
        flex items-start gap-2 px-2 py-1 font-mono text-xs
        ${bgColor} ${textColor}
        hover:bg-slate-100 dark:hover:bg-slate-800/50
      `}
    >
      <span className="w-8 text-right text-slate-400 select-none tabular-nums">
        {lineNumber}
      </span>
      <span className="w-4 text-center select-none font-bold">{prefix}</span>
      <span className="flex-1 break-all">{content}</span>
    </div>
  );
}

function SplitDiffLine({
  line,
  side,
  lineNumber,
}: DiffLineProps & { side: 'left' | 'right' }) {
  const bgColor = getLineBgColor(line);

  const content = useMemo(() => {
    const isLeft = side === 'left';

    switch (line.kind) {
      case 'Unchanged':
        return <span>{line.content}</span>;
      case 'Added':
        return isLeft ? <span className="text-slate-300"> </span> : <span>{line.content}</span>;
      case 'Removed':
        return isLeft ? <span>{line.content}</span> : <span className="text-slate-300"> </span>;
      case 'Modified':
        return isLeft ? (
          <span className={diffColors.removed.text}>{line.content.old}</span>
        ) : (
          <span className={diffColors.added.text}>{line.content.new}</span>
        );
      default:
        return null;
    }
  }, [line, side]);

  const showBg = useMemo(() => {
    if (side === 'left') {
      return line.kind === 'Removed' || line.kind === 'Modified';
    }
    return line.kind === 'Added' || line.kind === 'Modified';
  }, [line.kind, side]);

  return (
    <div
      className={`
        flex items-start gap-1 px-2 py-1 font-mono text-xs
        ${showBg ? bgColor : ''}
        hover:bg-slate-100 dark:hover:bg-slate-800/50
      `}
    >
      <span className="w-6 text-right text-slate-400 select-none tabular-nums text-[10px]">
        {lineNumber}
      </span>
      <span className="flex-1 break-all text-slate-700 dark:text-slate-300">
        {content}
      </span>
    </div>
  );
}

function CollapsedSectionRow({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className="
        flex items-center justify-center gap-2 w-full py-1.5
        text-xs text-slate-500 hover:text-slate-700
        bg-slate-50 dark:bg-slate-800/30
        hover:bg-slate-100 dark:hover:bg-slate-800/50
        transition-colors
      "
    >
      <ChevronDown className="w-3 h-3" />
      <span>{count} unchanged lines</span>
      <ChevronDown className="w-3 h-3" />
    </button>
  );
}

// Helper to check section type
function hasCollapsed(section: DiffSection): boolean {
  return 'Collapsed' in (section as Record<string, unknown>);
}

function hasVisible(section: DiffSection): boolean {
  return 'Visible' in (section as Record<string, unknown>);
}

// ── Main Component ─────────────────────────────────────────────────

export function DiffView({
  sections,
  viewMode,
}: DiffViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = (sectionId: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  if (viewMode === 'unified') {
    return (
      <div className="overflow-auto font-mono text-sm">
        {sections.map((section) => {
          const isCollapsed = hasCollapsed(section);
          const isVisible = hasVisible(section);
          const sec = section as unknown as Record<string, { items: IndexedLine[] }>;
          
          return (
            <div key={section.id}>
              {isCollapsed && (
                <CollapsedSectionRow
                  count={sec.Collapsed.items.length}
                  onExpand={() => toggleSection(section.id)}
                />
              )}
              {isVisible &&
                sec.Visible.items.map((item: IndexedLine) => (
                  <UnifiedDiffLine
                    key={item.index}
                    line={item}
                    lineNumber={item.index + 1}
                  />
                ))}
              {isCollapsed && expandedSections.has(section.id) &&
                sec.Collapsed.items.map((item: IndexedLine) => (
                  <UnifiedDiffLine
                    key={item.index}
                    line={item}
                    lineNumber={item.index + 1}
                  />
                ))}
            </div>
          );
        })}
      </div>
    );
  }

  // Split view
  return (
    <div className="flex overflow-auto font-mono text-sm">
      {/* Left side (old) */}
      <div className="flex-1 border-r border-slate-200 dark:border-slate-700">
        {sections.map((section) => {
          const isCollapsed = hasCollapsed(section);
          const isVisible = hasVisible(section);
          const sec = section as unknown as Record<string, { items: IndexedLine[] }>;
          
          return (
            <div key={section.id}>
              {isCollapsed && (
                <CollapsedSectionRow
                  count={sec.Collapsed.items.length}
                  onExpand={() => toggleSection(section.id)}
                />
              )}
              {isVisible &&
                sec.Visible.items.map((item: IndexedLine) => (
                  <SplitDiffLine
                    key={item.index}
                    line={item}
                    side="left"
                    lineNumber={item.index + 1}
                  />
                ))}
              {isCollapsed && expandedSections.has(section.id) &&
                sec.Collapsed.items.map((item: IndexedLine) => (
                  <SplitDiffLine
                    key={item.index}
                    line={item}
                    side="left"
                    lineNumber={item.index + 1}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {/* Right side (new) */}
      <div className="flex-1">
        {sections.map((section) => {
          const isCollapsed = hasCollapsed(section);
          const isVisible = hasVisible(section);
          const sec = section as unknown as Record<string, { items: IndexedLine[] }>;
          
          return (
            <div key={section.id}>
              {isCollapsed && (
                <CollapsedSectionRow
                  count={sec.Collapsed.items.length}
                  onExpand={() => toggleSection(section.id)}
                />
              )}
              {isVisible &&
                sec.Visible.items.map((item: IndexedLine) => (
                  <SplitDiffLine
                    key={item.index}
                    line={item}
                    side="right"
                    lineNumber={item.index + 1}
                  />
                ))}
              {isCollapsed && expandedSections.has(section.id) &&
                sec.Collapsed.items.map((item: IndexedLine) => (
                  <SplitDiffLine
                    key={item.index}
                    line={item}
                    side="right"
                    lineNumber={item.index + 1}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DiffView;
