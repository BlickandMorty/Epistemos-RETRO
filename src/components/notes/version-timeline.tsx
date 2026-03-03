/* ═══════════════════════════════════════════════════════════════════
   VersionTimeline — Visual version history timeline
   
   Horizontal timeline of version dots with sparkline showing word
   count over time. Dot size proportional to change magnitude.
   Color-coded: gray = minor edit, accent = major rewrite.
   ═══════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';
import type { PageVersion } from '@/lib/bindings';

// ── Types ──────────────────────────────────────────────────────────

interface VersionTimelineProps {
  versions: PageVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────

export function VersionTimeline({
  versions,
  selectedVersionId,
  onSelectVersion,
}: VersionTimelineProps) {
  useIsDark(); // Hook call to maintain consistency, value used via CSS dark:

  // Calculate word count deltas between consecutive versions
  const deltas = useMemo(() => {
    if (versions.length <= 1) {
      return versions.map((v) => v.word_count);
    }
    const result: number[] = [];
    for (let i = 0; i < versions.length; i++) {
      if (i < versions.length - 1) {
        result.push(Math.abs(versions[i].word_count - versions[i + 1].word_count));
      } else {
        result.push(0); // oldest version has no delta
      }
    }
    return result;
  }, [versions]);

  // Threshold: more than 20% word count change = major rewrite
  const isMajor = (index: number): boolean => {
    if (index >= deltas.length || index >= versions.length) return false;
    const wc = Math.max(versions[index].word_count, 1);
    return deltas[index] > wc / 5;
  };

  // Calculate dot size based on delta
  const dotSize = (index: number): number => {
    const delta = index < deltas.length ? deltas[index] : 0;
    // Range: 6px (tiny edit) to 12px (large rewrite)
    const clamped = Math.min(delta as number, 500) / 500;
    return 6 + clamped * 6;
  };

  // Dot color based on state
  const dotColor = (isSelected: boolean, isMajorEdit: boolean): string => {
    if (isSelected) {
      return 'bg-indigo-500 dark:bg-indigo-400';
    }
    return isMajorEdit
      ? 'bg-indigo-400/60 dark:bg-indigo-400/60'
      : 'bg-slate-400/30 dark:bg-slate-400/30';
  };

  // Format relative time for tooltip
  const formatRelativeTime = (timestamp: number): string => {
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
  };

  // Generate sparkline path
  const sparklinePath = useMemo(() => {
    if (versions.length < 2) return '';
    const wordCounts = versions.map((v) => v.word_count);
    const maxWc = Math.max(...wordCounts, 1);
    const minWc = Math.min(...wordCounts, 0);
    const range = Math.max(maxWc - minWc, 1);

    const width = 200;
    const height = 20;
    const step = width / (wordCounts.length - 1);

    return wordCounts
      .map((wc, i) => {
        const x = i * step;
        const normalized = (wc - minWc) / range;
        const y = height * (1 - normalized);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [versions]);

  if (versions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 w-full max-w-[200px]">
      {/* Sparkline */}
      <svg
        viewBox="0 0 200 20"
        className="w-full h-5"
        preserveAspectRatio="none"
      >
        <motion.path
          d={sparklinePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-slate-400/25"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
        />
      </svg>

      {/* Dots */}
      <div className="flex items-center gap-0 px-1">
        {versions.map((version, index) => {
          const isSelected = version.id === selectedVersionId;
          const major = isMajor(index);
          const size = dotSize(index);

          return (
            <div key={version.id} className="flex items-center flex-1">
              <motion.button
                onClick={() => onSelectVersion(version.id)}
                className={`
                  rounded-full transition-all duration-200
                  ${dotColor(isSelected, major)}
                  ${isSelected ? 'ring-2 ring-offset-1 ring-indigo-500/60' : ''}
                  hover:scale-110
                `}
                style={{ width: size, height: size }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.95 }}
                title={`${formatRelativeTime(version.timestamp)} (${version.word_count} words)`}
              />
              {index < versions.length - 1 && (
                <div className="flex-1 h-px bg-slate-400/15 min-w-[4px]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VersionTimeline;
