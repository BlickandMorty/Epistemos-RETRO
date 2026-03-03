/* ═══════════════════════════════════════════════════════════════════
   VersionCard — Individual version display component
   
   Displays a single version with metadata: timestamp, word count,
   change summary, and actions.
   ═══════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { 
  Clock, 
  FileText, 
  RotateCcw, 
  Trash2, 
  ChevronRight,
  GitCommit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PageVersion } from '@/lib/bindings';

// ── Types ──────────────────────────────────────────────────────────

interface VersionCardProps {
  version: PageVersion;
  isSelected?: boolean;
  isLatest?: boolean;
  onSelect?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onCompare?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ──────────────────────────────────────────────────────

export function VersionCard({
  version,
  isSelected = false,
  isLatest = false,
  onSelect,
  onRestore,
  onDelete,
  onCompare,
}: VersionCardProps) {
  return (
    <motion.div
      onClick={onSelect}
      className={`
        relative flex items-start gap-3 p-3 rounded-lg cursor-pointer
        border transition-all duration-200
        ${isSelected 
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' 
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }
      `}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
    >
      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          layoutId="selection-indicator"
          className="absolute left-0 top-3 bottom-3 w-0.5 bg-indigo-500 rounded-r-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* Icon */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
        ${isLatest 
          ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' 
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        }
      `}>
        <GitCommit className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {formatRelativeTime(version.timestamp)}
          </span>
          {isLatest && (
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 rounded-full">
              Latest
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatFullDate(version.timestamp)}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {version.word_count} words
          </span>
        </div>

        {version.changes_summary && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
            {version.changes_summary}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onCompare && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onCompare();
            }}
            title="Compare with current"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
        {onRestore && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            title="Restore this version"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-500 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete version"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export default VersionCard;
