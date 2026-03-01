'use client';

import {
  memo,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon,
  CodeIcon,
  EyeIcon,
  PencilIcon,
  ChevronLeftIcon,
  CopyIcon,
  CheckIcon,
  FileTextIcon,
  ChevronUpIcon,
  PlusIcon,
  SendIcon,
} from 'lucide-react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import { ease } from '@/lib/motion/motion-config';

const CUPERTINO = ease.cupertino;

const PFC_VIOLET = 'var(--pfc-accent)';
const PFC_GREEN = '#34D399';
const PFC_EMBER = '#E07850';

// ---------------------------------------------------------------------------
// PortalSidebar (main export)
// ---------------------------------------------------------------------------

export const PortalSidebar = memo(function PortalSidebar() {
  const showPortal = usePFCStore((s) => s.showPortal);
  const portalStack = usePFCStore((s) => s.portalStack);
  const displayMode = usePFCStore((s) => s.portalDisplayMode);
  const closePortal = usePFCStore((s) => s.closePortal);
  const goBack = usePFCStore((s) => s.portalGoBack);
  const setPortalDisplayMode = usePFCStore((s) => s.setPortalDisplayMode);
  const { isDark, isOled } = useIsDark();

  // Local edit mode (extends store's 'code' | 'preview' with 'edit')
  const [isEditMode, setIsEditMode] = useState(false);
  const localMode: 'preview' | 'code' | 'edit' = isEditMode ? 'edit' : displayMode;

  const currentView = useMemo(
    () => portalStack[portalStack.length - 1],
    [portalStack],
  );
  const canGoBack = portalStack.length > 1;
  const handleClosePortal = useCallback(() => {
    setIsEditMode(false);
    closePortal();
  }, [closePortal]);

  // Handle mode switching — sync back to store for code/preview
  const handleModeChange = useCallback(
    (mode: 'preview' | 'code' | 'edit') => {
      if (mode === 'edit') {
        setIsEditMode(true);
      } else {
        setIsEditMode(false);
        setPortalDisplayMode(mode);
      }
    },
    [setPortalDisplayMode],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!showPortal) return;

    const handler = (e: KeyboardEvent) => {
      // Escape closes portal
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClosePortal();
        return;
      }
      // Cmd/Ctrl+E toggles edit mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setIsEditMode((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showPortal, handleClosePortal]);

  if (!showPortal || !currentView) return null;

  const artifact = currentView.artifact;
  const isArtifact = currentView.type === 'artifact' && !!artifact;

  // Glass panel styles
  const panelBg = isOled
    ? 'rgba(8,8,8,0.95)'
    : isDark
      ? 'rgba(28,27,25,0.92)'
      : 'rgba(245,240,232,0.90)';
  const borderColor = isOled
    ? 'rgba(40,40,40,0.35)'
    : isDark
      ? 'rgba(79,69,57,0.3)'
      : 'rgba(0,0,0,0.06)';
  const headerBg = isOled
    ? 'rgba(20,20,20,0.4)'
    : isDark
      ? 'rgba(244,189,111,0.02)'
      : 'rgba(0,0,0,0.02)';
  const mutedText = isOled
    ? 'rgba(130,130,130,0.5)'
    : isDark
      ? 'rgba(156,143,128,0.5)'
      : 'rgba(0,0,0,0.4)';
  const fgText = isOled
    ? 'rgba(220,220,220,0.9)'
    : isDark
      ? 'rgba(237,224,212,0.9)'
      : 'rgba(0,0,0,0.85)';

  return (
    <AnimatePresence>
      {showPortal && (
        <>
          {/* Backdrop on small screens */}
          <motion.div
            key="portal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: CUPERTINO }}
            onClick={handleClosePortal}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 'var(--z-modal-backdrop)',
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              contain: 'layout paint',
            }}
            className="lg:hidden"
          />

          {/* Main panel */}
          <motion.div
            key="portal-panel"
            data-portal-panel
            role="dialog"
            aria-modal="true"
            aria-label={artifact?.title || 'Code Portal'}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.4, ease: CUPERTINO }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100%',
              width: '50%',
              maxWidth: '720px',
              minWidth: '380px',
              zIndex: 'var(--z-modal)',
              display: 'flex',
              flexDirection: 'column',
              background: panelBg,
              backdropFilter: 'blur(16px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
              borderLeft: `1px solid ${borderColor}`,
              boxShadow: isDark
                ? '-8px 0 32px rgba(0,0,0,0.3)'
                : '-8px 0 32px rgba(0,0,0,0.06)',
              contain: 'layout paint',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderBottom: `1px solid ${borderColor}`,
                background: headerBg,
                flexShrink: 0,
              }}
            >
              {/* Back button */}
              {canGoBack && (
                <button
                  onClick={goBack}
                  aria-label="Go back"
                  style={{
                    padding: '6px',
                    borderRadius: '9999px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: mutedText,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = isOled
                      ? 'rgba(255,255,255,0.04)'
                      : isDark
                        ? 'rgba(244,189,111,0.06)'
                        : 'rgba(0,0,0,0.06)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <ChevronLeftIcon size={16} />
                </button>
              )}

              {/* Title + language badge */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      fontWeight: 600,
                      color: fgText,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {artifact?.title || 'Code Portal'}
                  </h3>
                  {artifact?.language && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: `${PFC_VIOLET}20`,
                        color: PFC_VIOLET,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                      }}
                    >
                      {artifact.language}
                    </span>
                  )}
                </div>
              </div>

              {/* Mode toggle buttons */}
              {isArtifact && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '9999px',
                    padding: '2px',
                    background: isOled
                      ? 'rgba(30,30,30,0.4)'
                      : isDark
                        ? 'rgba(244,189,111,0.03)'
                        : 'rgba(0,0,0,0.04)',
                    flexShrink: 0,
                  }}
                >
                  <ModeButton
                    active={localMode === 'preview'}
                    onClick={() => handleModeChange('preview')}
                    icon={<EyeIcon size={14} />}
                    label="Preview"
                    isDark={isDark}
                    isOled={isOled}
                  />
                  <ModeButton
                    active={localMode === 'code'}
                    onClick={() => handleModeChange('code')}
                    icon={<CodeIcon size={14} />}
                    label="Code"
                    isDark={isDark}
                    isOled={isOled}
                  />
                  <ModeButton
                    active={localMode === 'edit'}
                    onClick={() => handleModeChange('edit')}
                    icon={<PencilIcon size={14} />}
                    label="Edit"
                    isDark={isDark}
                    isOled={isOled}
                  />
                </div>
              )}

              {/* Close button */}
              <button
                onClick={handleClosePortal}
                aria-label="Close portal"
                style={{
                  padding: '6px',
                  borderRadius: '9999px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: mutedText,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = isDark
                    ? 'rgba(244,189,111,0.06)'
                    : 'rgba(0,0,0,0.06)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* ── Body ───────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {isArtifact && artifact && (
                <ArtifactEditor
                  key={artifact.identifier}
                  artifact={artifact}
                  mode={localMode}
                  isDark={isDark}
                  borderColor={borderColor}
                  mutedText={mutedText}
                  fgText={fgText}
                />
              )}
              {currentView.type === 'terminal' && (
                <TerminalPlaceholder isDark={isDark} mutedText={mutedText} fgText={fgText} />
              )}
              {currentView.type === 'home' && (
                <PortalHome isDark={isDark} mutedText={mutedText} fgText={fgText} />
              )}
            </div>
          </motion.div>

          {/* Responsive override: full-width on small screens */}
          <style>{`
            @media (max-width: 1023px) {
              [data-portal-panel] {
                width: 100% !important;
                min-width: unset !important;
                max-width: unset !important;
              }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// ModeButton
// ---------------------------------------------------------------------------

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isDark: boolean;
  isOled?: boolean;
}

const ModeButton = memo<ModeButtonProps>(function ModeButton({
  active,
  onClick,
  icon,
  label,
  isDark,
  isOled,
}) {
  const inactiveColor = isOled ? 'rgba(130,130,130,0.7)' : isDark ? 'rgba(156,143,128,0.7)' : 'rgba(0,0,0,0.35)';
  const hoverColor = isOled ? 'rgba(200,200,200,0.8)' : isDark ? 'rgba(237,224,212,0.8)' : 'rgba(0,0,0,0.6)';
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '9999px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: 500,
        transition: 'all 0.15s ease',
        background: active ? `${PFC_VIOLET}20` : 'transparent',
        color: active ? PFC_VIOLET : inactiveColor,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = inactiveColor;
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// ArtifactEditor
// ---------------------------------------------------------------------------

interface ArtifactEditorProps {
  artifact: {
    messageId: string;
    identifier: string;
    title: string;
    type: string;
    language?: string;
    content: string;
  };
  mode: 'preview' | 'code' | 'edit';
  isDark: boolean;
  borderColor: string;
  mutedText: string;
  fgText: string;
}

const ArtifactEditor = memo<ArtifactEditorProps>(function ArtifactEditor({
  artifact,
  mode,
  isDark,
  borderColor,
  mutedText,
  fgText,
}) {
  const router = useRouter();
  const notePages = usePFCStore((s) => s.notePages);
  const createPage = usePFCStore((s) => s.createPage);
  const createBlock = usePFCStore((s) => s.createBlock);
  const setActivePage = usePFCStore((s) => s.setActivePage);

  // Local edited content
  const [editedContent, setEditedContent] = useState(artifact.content);
  const [hasEdited, setHasEdited] = useState(false);

  // Auto-scroll ref for preview/code modes
  const scrollRef = useRef<HTMLDivElement>(null);

  // Copy state
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send-to-notes dropdown state
  const [notesOpen, setNotesOpen] = useState(false);
  const notesDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll in preview/code modes during streaming
  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== 'edit' && scrollRef.current) {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
    return () => {
      if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
    };
  }, [artifact.content, mode]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!notesOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        notesDropdownRef.current &&
        !notesDropdownRef.current.contains(e.target as Node)
      ) {
        setNotesOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notesOpen]);

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // The content to use for copy / send operations
  const activeContent = hasEdited ? editedContent : artifact.content;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [activeContent]);

  const handleEdit = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditedContent(e.target.value);
      setHasEdited(true);
    },
    [],
  );

  const handleCreateNewNote = useCallback(() => {
    const title = artifact.title || 'Untitled Artifact';
    const pageId = createPage(title);
    createBlock(pageId, null, null, activeContent);
    setActivePage(pageId);
    setNotesOpen(false);
    router.push('/notes');
  }, [artifact.title, activeContent, createPage, createBlock, setActivePage, router]);

  const handleSendToExistingNote = useCallback(
    (pageId: string) => {
      createBlock(pageId, null, null, activeContent);
      setActivePage(pageId);
      setNotesOpen(false);
      router.push('/notes');
    },
    [activeContent, createBlock, setActivePage, router],
  );

  // Generate line numbers for code view
  const lines = (mode === 'code' ? artifact.content : '').split('\n');

  const recentPages = useMemo(
    () => notePages.slice(-5).reverse(),
    [notePages],
  );

  // ── Shared inline colors ──
  const codeBg = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0, 0, 0, 0.03)';
  const lineNumColor = isDark
    ? 'rgba(156,143,128,0.25)'
    : 'rgba(0,0,0,0.2)';
  const actionBarBg = isDark
    ? 'rgba(244,189,111,0.02)'
    : 'rgba(0,0,0,0.02)';

  return (
    <>
      {/* ── Content area ───────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Preview mode */}
        {mode === 'preview' && (
          <div style={{ padding: '20px' }}>
            <div
              style={{
                borderRadius: '12px',
                border: `1px solid ${borderColor}`,
                background: isDark
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(0,0,0,0.01)',
                padding: '20px',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: fgText,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  tabSize: 2,
                }}
              >
                {artifact.content}
              </pre>
            </div>
          </div>
        )}

        {/* Code mode — with line numbers */}
        {mode === 'code' && (
          <div
            style={{
              display: 'flex',
              background: codeBg,
              minHeight: '100%',
            }}
          >
            {/* Line numbers gutter */}
            <div
              style={{
                padding: '16px 0',
                textAlign: 'right',
                userSelect: 'none',
                flexShrink: 0,
                minWidth: '48px',
                borderRight: `1px solid ${borderColor}`,
              }}
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    fontSize: '12px',
                    lineHeight: '20px',
                    color: lineNumColor,
                    paddingRight: '12px',
                    paddingLeft: '12px',
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Code content */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <pre
                style={{
                  margin: 0,
                  padding: '16px',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: '12px',
                  lineHeight: '20px',
                  color: fgText,
                  whiteSpace: 'pre',
                  tabSize: 2,
                }}
              >
                <code>{artifact.content}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Edit mode — full textarea */}
        {mode === 'edit' && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {hasEdited && (
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: '11px',
                  color: PFC_EMBER,
                  background: `${PFC_EMBER}10`,
                  borderBottom: `1px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <PencilIcon size={12} />
                <span>Locally edited — changes are not saved to the conversation</span>
              </div>
            )}
            <textarea
              value={hasEdited ? editedContent : artifact.content}
              onChange={handleEdit}
              spellCheck={false}
              style={{
                flex: 1,
                width: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: '16px',
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '12px',
                lineHeight: '20px',
                color: fgText,
                background: isDark
                  ? 'rgba(0, 0, 0, 0.5)'
                  : 'rgba(0, 0, 0, 0.02)',
                tabSize: 2,
                caretColor: PFC_VIOLET,
              }}
            />
          </div>
        )}
      </div>

      {/* ── Bottom action bar ──────────────────────────── */}
      <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderTop: `1px solid ${borderColor}`,
            background: actionBarBg,
            flexShrink: 0,
          }}
        >
          {/* Copy button */}
          <ActionButton
            onClick={handleCopy}
            isDark={isDark}
            icon={
              copied ? (
                <CheckIcon size={14} style={{ color: PFC_GREEN }} />
              ) : (
                <CopyIcon size={14} />
              )
            }
            label={copied ? 'Copied!' : 'Copy'}
            labelColor={copied ? PFC_GREEN : undefined}
          />

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Send to Notes dropdown */}
          <div
            ref={notesDropdownRef}
            style={{ position: 'relative' }}
          >
            <ActionButton
              onClick={() => setNotesOpen((p) => !p)}
              isDark={isDark}
              icon={<SendIcon size={14} />}
              label="Send to Notes"
              rightIcon={
                <ChevronUpIcon
                  size={12}
                  style={{
                    transition: 'transform 0.2s ease',
                    transform: notesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              }
            />

            {/* Dropdown popover */}
            <AnimatePresence>
              {notesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: CUPERTINO }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '6px',
                    minWidth: '220px',
                    maxWidth: '280px',
                    borderRadius: '1rem',
                    border: `1px solid ${borderColor}`,
                    background: isDark
                      ? 'rgba(28,27,25,0.96)'
                      : 'rgba(255, 255, 255, 0.96)',
                    backdropFilter: 'blur(12px) saturate(1.3)',
                    WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
                    boxShadow: isDark
                      ? '0 4px 16px rgba(0,0,0,0.2)'
                      : '0 4px 16px rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                    zIndex: 'var(--z-popover)',
                    transform: 'translateZ(0)',
                  }}
                >
                  {/* Create new note option */}
                  <button
                    onClick={handleCreateNewNote}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: PFC_GREEN,
                      textAlign: 'left',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = isDark
                        ? 'rgba(244,189,111,0.06)'
                        : 'rgba(0,0,0,0.04)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <PlusIcon size={14} />
                    <span>Create new note</span>
                  </button>

                  {/* Divider + recent notes */}
                  {recentPages.length > 0 && (
                    <>
                      <div
                        style={{
                          height: '1px',
                          background: borderColor,
                        }}
                      />
                      <div
                        style={{
                          padding: '6px 14px 4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: mutedText,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        Recent notes
                      </div>
                      {recentPages.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => handleSendToExistingNote(page.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 14px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: fgText,
                            textAlign: 'left',
                            overflow: 'hidden',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = isDark
                              ? 'rgba(244,189,111,0.06)'
                              : 'rgba(0,0,0,0.04)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = 'transparent')
                          }
                        >
                          <FileTextIcon
                            size={13}
                            style={{ color: mutedText, flexShrink: 0 }}
                          />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {page.name || 'Untitled'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
    </>
  );
});

// ---------------------------------------------------------------------------
// ActionButton
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  onClick: () => void;
  isDark: boolean;
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  rightIcon?: React.ReactNode;
}

const ActionButton = memo<ActionButtonProps>(function ActionButton({
  onClick,
  isDark,
  icon,
  label,
  labelColor,
  rightIcon,
}) {
  const mutedText = isDark
    ? 'rgba(156,143,128,0.7)'
    : 'rgba(0,0,0,0.5)';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '9999px',
        border: 'none',
        background: isDark
          ? 'rgba(244,189,111,0.05)'
          : 'rgba(0,0,0,0.03)',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        color: labelColor || mutedText,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark
          ? 'rgba(244,189,111,0.10)'
          : 'rgba(0,0,0,0.06)';
        if (!labelColor) {
          e.currentTarget.style.color = isDark
            ? 'rgba(237,224,212,0.8)'
            : 'rgba(0,0,0,0.7)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isDark
          ? 'rgba(244,189,111,0.05)'
          : 'rgba(0,0,0,0.03)';
        if (!labelColor) {
          e.currentTarget.style.color = mutedText;
        }
      }}
    >
      {icon}
      <span>{label}</span>
      {rightIcon}
    </button>
  );
});

// ---------------------------------------------------------------------------
// TerminalPlaceholder
// ---------------------------------------------------------------------------

interface PlaceholderProps {
  isDark: boolean;
  mutedText: string;
  fgText: string;
}

function TerminalPlaceholder({ isDark, mutedText, fgText }: PlaceholderProps) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '1rem',
          background: isDark
            ? 'rgba(244,189,111,0.04)'
            : 'rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        <CodeIcon size={24} style={{ color: `${PFC_GREEN}99` }} />
      </div>
      <h4
        style={{
          margin: '0 0 4px',
          fontSize: '14px',
          fontWeight: 600,
          color: fgText,
          opacity: 0.7,
        }}
      >
        Terminal
      </h4>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: mutedText,
          maxWidth: '240px',
          lineHeight: 1.5,
        }}
      >
        Terminal integration coming soon. Execute code suggestions directly.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PortalHome
// ---------------------------------------------------------------------------

function PortalHome({ isDark, mutedText, fgText }: PlaceholderProps) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '1rem',
          background: isDark
            ? 'rgba(244,189,111,0.04)'
            : 'rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        <CodeIcon size={24} style={{ color: `${PFC_VIOLET}99` }} />
      </div>
      <h4
        style={{
          margin: '0 0 4px',
          fontSize: '14px',
          fontWeight: 600,
          color: fgText,
          opacity: 0.7,
        }}
      >
        Code Portal
      </h4>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: mutedText,
          maxWidth: '240px',
          lineHeight: 1.5,
        }}
      >
        Code suggestions and artifacts from the AI will appear here automatically.
      </p>
    </div>
  );
}
