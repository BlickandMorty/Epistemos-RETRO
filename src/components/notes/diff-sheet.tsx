/* ═══════════════════════════════════════════════════════════════════
   DiffSheet — Modal for viewing diffs and version history
   
   GitHub-style diff viewer presented as a sheet/modal.
   Features: unified + split toggle, version picker, context folding,
   restore-to-version with undo, and more actions.
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  List, 
  Columns, 
  ChevronUp, 
  ChevronDown,
  RotateCcw,
  MoreHorizontal,
  Copy,
  Trash2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { VersionTimeline } from './version-timeline';
import { DiffView } from './diff-view';
import { commands, type PageVersion, type LineDiff, type DiffSection } from '@/lib/bindings';

// ── Types ──────────────────────────────────────────────────────────

interface DiffSheetProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string;
  pageTitle: string;
  currentBody: string;
}

// ── Component ──────────────────────────────────────────────────────

export function DiffSheet({
  isOpen,
  onClose,
  pageId,
  pageTitle,
  currentBody,
}: DiffSheetProps) {
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [diff, setDiff] = useState<LineDiff | null>(null);
  const [sections, setSections] = useState<DiffSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);

  // Load versions on open
  useEffect(() => {
    if (isOpen && pageId) {
      loadVersions();
    }
  }, [isOpen, pageId]);

  // Recompute diff when selection changes
  useEffect(() => {
    if (selectedVersionId && currentBody) {
      computeDiff();
    }
  }, [selectedVersionId, currentBody, viewMode]);

  const loadVersions = async () => {
    setIsLoading(true);
    const result = await commands.getPageVersions(pageId);
    if (result.status === 'ok') {
      setVersions(result.data);
      if (result.data.length > 0 && !selectedVersionId) {
        setSelectedVersionId(result.data[0].id);
      }
    }
    setIsLoading(false);
  };

  const computeDiff = async () => {
    if (!selectedVersionId) return;
    
    const result = await commands.getSectionedDiff(
      selectedVersionId,
      selectedVersionId,
      3
    );
    
    if (result.status === 'ok') {
      const [diffData, sectionsData] = result.data;
      setDiff(diffData);
      setSections(sectionsData);
    }
  };

  const selectedVersion = useMemo(() => {
    return versions.find((v) => v.id === selectedVersionId);
  }, [versions, selectedVersionId]);

  const chunkStarts = useMemo(() => {
    if (!diff) return [];
    const indices: number[] = [];
    let inChange = false;
    diff.lines.forEach((line, idx) => {
      const isChange = line.kind !== 'Unchanged';
      if (isChange && !inChange) {
        indices.push(idx);
      }
      inChange = isChange;
    });
    return indices;
  }, [diff]);

  const goToNextChunk = useCallback(() => {
    if (chunkStarts.length === 0) return;
    setCurrentChunkIdx((prev) => Math.min(prev + 1, chunkStarts.length - 1));
  }, [chunkStarts.length]);

  const goToPrevChunk = useCallback(() => {
    if (chunkStarts.length === 0) return;
    setCurrentChunkIdx((prev) => Math.max(prev - 1, 0));
  }, [chunkStarts.length]);

  const handleRestore = async () => {
    if (!selectedVersionId) return;
    
    const result = await commands.restoreVersion(selectedVersionId);
    if (result.status === 'ok') {
      setShowRestoreDialog(false);
      setRestoredNotice(true);
      setTimeout(() => setRestoredNotice(false), 3000);
      loadVersions();
    }
  };

  const handleDeleteVersion = async () => {
    if (!selectedVersionId) return;
    
    const result = await commands.deleteVersion(selectedVersionId);
    if (result.status === 'ok') {
      setShowDeleteDialog(false);
      loadVersions();
    }
  };

  const handleCopyVersionText = () => {
    if (selectedVersion) {
      navigator.clipboard.writeText(selectedVersion.body);
    }
  };

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

  const hasVersions = versions.length > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 md:inset-10 lg:inset-20 z-50 flex flex-col"
      >
        <GlassPanel className="flex flex-col w-full h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/20 dark:border-slate-700/30">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {pageTitle || 'Untitled'}
              </h2>
              
              {diff && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-green-600 dark:text-green-400">
                    +{diff.stats.added}
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    -{diff.stats.removed}
                  </span>
                  {diff.stats.modified > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ~{diff.stats.modified}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Version Timeline */}
              {hasVersions && (
                <VersionTimeline
                  versions={versions}
                  selectedVersionId={selectedVersionId}
                  onSelectVersion={setSelectedVersionId}
                />
              )}

              {/* Chunk Navigation */}
              {chunkStarts.length > 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToPrevChunk}
                    title="Previous change (⌥↑)"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-slate-500 w-10 text-center font-mono">
                    {currentChunkIdx + 1}/{chunkStarts.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={goToNextChunk}
                    title="Next change (⌥↓)"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* View Toggle */}
              <div className="flex items-center border border-slate-200/30 dark:border-slate-700/30 rounded-md">
                <Button
                  variant={viewMode === 'unified' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-none rounded-l-md"
                  onClick={() => setViewMode('unified')}
                >
                  <List className="h-3 w-3" />
                </Button>
                <Button
                  variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-none rounded-r-md"
                  onClick={() => setViewMode('split')}
                >
                  <Columns className="h-3 w-3" />
                </Button>
              </div>

              {/* Restore Button */}
              {selectedVersion && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowRestoreDialog(true)}
                  title="Restore this version"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}

              {/* More Actions */}
              {selectedVersion && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyVersionText}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Version Text
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Version
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <Clock className="h-5 w-5 animate-spin mr-2" />
                Loading versions...
              </div>
            ) : !hasVersions ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                <RotateCcw className="h-10 w-10 opacity-50" />
                <p className="text-sm font-medium">No previous versions</p>
                <p className="text-xs">Save your note to create the first version snapshot.</p>
              </div>
            ) : diff && sections.length > 0 ? (
              <DiffView diff={diff} sections={sections} viewMode={viewMode} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Computing diff...
              </div>
            )}

            {/* Restored Notice */}
            <AnimatePresence>
              {restoredNotice && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-sm shadow-lg"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span>Version restored — refresh to see changes</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version</AlertDialogTitle>
            <AlertDialogDescription>
              Replace the current note body with this version from{' '}
              {selectedVersion && formatRelativeTime(selectedVersion.timestamp)}? 
              The current content will be saved as a new version first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this version? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVersion} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default DiffSheet;
