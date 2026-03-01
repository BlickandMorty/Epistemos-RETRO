'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

import { useIsDark } from '@/hooks/use-is-dark';
import { useTypewriter } from '@/hooks/use-typewriter';
import { usePFCStore, type PFCState } from '@/lib/store/use-pfc-store';
import {
  HomeIcon,
  BarChart3Icon,
  SettingsIcon,
  PenLineIcon,
  LibraryIcon,
  ServerIcon,
  WifiIcon,
  ActivityIcon,
  BotIcon,
  MessageSquareIcon,
  type LucideIcon,
} from 'lucide-react';
import { SteeringIndicator } from '../chat/steering-indicator';

/* ─── Constants ─── */
import { cssEase } from '@/lib/motion/motion-config';

const CUP = cssEase.emphasized;
const T_SIZE = `padding 0.25s ${CUP}, gap 0.25s ${CUP}`;
const T_LABEL = `max-width 0.25s ${CUP}, opacity 0.18s ${CUP}`;
const T_COLOR = 'background 0.15s ease, color 0.15s ease';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: 'core' | 'tools' | 'utility';
  activePrefix?: string;
  neverActive?: boolean;
}

/* Nav items — Home is plain, Chat gets special ChatPFCBubble */
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon, group: 'core' },
  { href: '/chat', label: 'Chat', icon: MessageSquareIcon, group: 'core', activePrefix: '/chat' },
  { href: '/notes', label: 'Notes', icon: PenLineIcon, group: 'core' },
  { href: '/library', label: 'Library', icon: LibraryIcon, group: 'core' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3Icon, group: 'tools' },
  { href: '/daemon', label: 'Daemon', icon: BotIcon, group: 'tools' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, group: 'utility' },
];

const MODE_STYLES: Record<string, { label: string }> = {
  api: { label: 'API' },
  local: { label: 'Local' },
};

/* ─── Theming helpers ─── */
function bubbleBg(isActive: boolean, isDark: boolean, disabled?: boolean, isOled?: boolean, isSunny?: boolean, isSunset?: boolean, isCosmic?: boolean) {
  if (disabled) return 'transparent';
  if (isActive) {
    if (isOled) return 'rgba(20,20,20,0.7)';
    if (isSunny) return 'var(--secondary)';
    if (isSunset) return 'rgba(50,30,48,0.8)';
    if (isCosmic) return 'rgba(25,22,42,0.75)';
    // Default light: white pill on pitch black bar
    return isDark ? 'rgba(16,13,10,0.75)' : 'rgba(255,255,255,0.2)';
  }
  return 'transparent';
}

function bubbleColor(isActive: boolean, isDark: boolean, disabled?: boolean, isOled?: boolean, isSunny?: boolean, isSunset?: boolean, isCosmic?: boolean) {
  if (disabled) {
    if (isOled) return 'rgba(120,120,120,0.55)';
    if (isSunny) return 'var(--muted-foreground)';
    if (isSunset) return 'rgba(176,152,136,0.55)';
    if (isCosmic) return 'rgba(155,150,175,0.55)';
    return isDark ? 'rgba(170,164,152,0.55)' : 'rgba(255,255,255,0.35)';
  }
  if (isActive) {
    if (isOled) return 'rgba(220,220,220,0.95)';
    if (isSunny) return 'var(--foreground)';
    if (isSunset) return 'rgba(245,184,74,0.95)';
    if (isCosmic) return 'rgba(200,195,225,0.95)';
    return isDark ? 'rgba(232,228,222,0.95)' : 'rgba(255,255,255,0.97)';
  }
  if (isOled) return 'rgba(180,180,180,0.92)';
  if (isSunny) return 'color-mix(in srgb, var(--foreground) 82%, transparent)';
  if (isSunset) return 'rgba(212,184,168,0.92)';
  if (isCosmic) return 'rgba(185,180,210,0.88)';
  return isDark ? 'rgba(205,198,186,0.92)' : 'rgba(255,255,255,0.82)';
}

/** Active icon color — white on light mode (pitch black nav bar), accent on dark themes */
function activeIconColor(isDark: boolean, isOled?: boolean, isSunny?: boolean, isCosmic?: boolean) {
  if (isSunny) return 'var(--pfc-accent)';
  if (isCosmic) return '#8B9FD4';
  // Light mode: white icons on pitch black nav bar
  return isDark ? 'var(--pfc-accent)' : '#FFFFFF';
}

/* ═══════════════════════════════════════════════════════════════════
   NavBubble — CSS transitions only, no layout prop
   ═══════════════════════════════════════════════════════════════════ */
const NavBubble = memo(function NavBubble({
  item,
  isActive,
  isDark,
  isOled,
  isSunny,
  isSunset,
  isCosmic,
  onNavigate,
  disabled,
  disabledReason,
}: {
  item: NavItem;
  isActive: boolean;
  isDark: boolean;
  isOled?: boolean;
  isSunny?: boolean;
  isSunset?: boolean;
  isCosmic?: boolean;
  onNavigate: (href: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Clear pending hover timer on unmount to prevent setState on unmounted component
  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);
  const expanded = (hovered || isActive) && !disabled;
  const Icon = item.icon;

  // Typewriter effect on hover — types out label with RetroGaming font + cursor
  const { displayText: twText, cursorVisible: twCursor } = useTypewriter(
    item.label,
    hovered && !isActive && !disabled,
    { speed: 35, startDelay: 80, cursorLingerMs: 600 },
  );

  // Show typewriter text when hovering (not active), else show full label when active
  const labelText = hovered && !isActive && !disabled ? twText : (expanded ? item.label : '');
  const usePixelFont = hovered && !isActive && !disabled;

  return (
    <button
      onClick={() => !disabled && onNavigate(item.href)}
      onMouseEnter={() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => setHovered(true), 120);
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHovered(false);
      }}
      title={disabled ? `${item.label} — enable ${disabledReason} in Settings` : item.label}
      aria-label={disabled ? `${item.label} — enable ${disabledReason} in Settings` : item.label}
      aria-disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: expanded ? '0.5rem' : '0rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        borderRadius: '9999px',
        padding: expanded ? '0.4375rem 0.875rem' : '0.4375rem 0.5625rem',
        height: '2.375rem',
        fontSize: usePixelFont ? '0.625rem' : '0.8125rem',
        fontWeight: isActive ? 650 : 500,
        letterSpacing: usePixelFont ? '0.01em' : '-0.01em',
        opacity: disabled ? 0.35 : 1,
        color: bubbleColor(isActive, isDark, disabled, isOled, isSunny, isSunset, isCosmic),
        background: bubbleBg(isActive, isDark, disabled, isOled, isSunny, isSunset, isCosmic),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transition: `${T_SIZE}, ${T_COLOR}`,
        transform: 'translateZ(0)',
      }}
    >
      <Icon style={{
        height: '1.0625rem',
        width: '1.0625rem',
        flexShrink: 0,
        color: isActive ? activeIconColor(isDark, isOled, isSunny, isCosmic) : 'inherit',
        transition: 'color 0.15s',
      }} />
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        maxWidth: expanded ? '8rem' : '0rem',
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        transition: T_LABEL,
        fontFamily: (usePixelFont || isActive) ? 'var(--font-heading)' : 'inherit',
        fontSize: isActive ? '0.625rem' : undefined,
      }}>
        {labelText}
        {usePixelFont && twCursor && (
          <span style={{
            display: 'inline-block',
            width: '1.5px',
            height: '0.625rem',
            backgroundColor: 'var(--pfc-accent)',
            marginLeft: '1px',
            flexShrink: 0,
          }} />
        )}
      </span>
    </button>
  );
});

/* ═══════════════════════════════════════════════════════════════════
   Selectors for PFC Engine badge (used by ChatPFCBubble)
   ═══════════════════════════════════════════════════════════════════ */
const selectIsProcessing = (s: PFCState) => s.isProcessing;
const selectActiveStage = (s: PFCState) => s.activeStage;
const selectMessages = (s: PFCState) => s.messages;
const selectInferenceMode = (s: PFCState) => s.inferenceMode;

/* ═══════════════════════════════════════════════════════════════════
   ChatPFCBubble — Chat button that morphs into "Lab Engine" bar
   When on /chat/* with messages → shows "Lab Engine" + mode/stage badges
   Otherwise → shows "Chat" icon, expands label on hover
   ═══════════════════════════════════════════════════════════════════ */
const ChatPFCBubble = memo(function ChatPFCBubble({
  isDark,
  isOled,
  isSunny,
  isSunset,
  isCosmic,
  isOnChat,
  onNavigate,
}: {
  isDark: boolean;
  isOled?: boolean;
  isSunny?: boolean;
  isSunset?: boolean;
  isCosmic?: boolean;
  isOnChat: boolean;
  onNavigate: (href: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

  const isProcessing = usePFCStore(selectIsProcessing);
  const activeStage = usePFCStore(selectActiveStage);
  const messages = usePFCStore(selectMessages);
  const inferenceMode = usePFCStore(selectInferenceMode);

  const hasMessages = messages.length > 0;
  const modeInfo = MODE_STYLES[inferenceMode] ?? MODE_STYLES.api!;

  // Lab Engine mode: on chat page with messages
  const pfcMode = isOnChat && hasMessages;
  const showLabel = hovered || pfcMode || isOnChat;

  const chatLabel = pfcMode ? 'Lab Engine' : 'Chat';
  const shouldTypewrite = hovered && !pfcMode && !isOnChat;
  const { displayText: twText, cursorVisible: twCursor } = useTypewriter(
    chatLabel,
    shouldTypewrite,
    { speed: 35, startDelay: 80, cursorLingerMs: 600 },
  );
  const labelText = shouldTypewrite ? twText : (showLabel ? chatLabel : '');
  const usePixelFont = shouldTypewrite;

  return (
    <button
      onClick={() => onNavigate('/chat')}
      onMouseEnter={() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => setHovered(true), 120);
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHovered(false);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: showLabel ? '0.5rem' : '0rem',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '9999px',
        padding: showLabel ? '0.4375rem 0.875rem' : '0.4375rem 0.5625rem',
        height: '2.375rem',
        fontSize: usePixelFont ? '0.625rem' : '0.8125rem',
        fontWeight: (pfcMode || isOnChat) ? 650 : 500,
        letterSpacing: usePixelFont ? '0.01em' : '-0.01em',
        color: bubbleColor(pfcMode || isOnChat || hovered, isDark, false, isOled, isSunny, isSunset, isCosmic),
        background: bubbleBg(pfcMode || isOnChat, isDark, false, isOled, isSunny, isSunset, isCosmic),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transition: `${T_SIZE}, ${T_COLOR}`,
        transform: 'translateZ(0)',
      }}
    >
      <MessageSquareIcon style={{
        height: '1.0625rem',
        width: '1.0625rem',
        flexShrink: 0,
        color: (pfcMode || isOnChat || hovered) ? activeIconColor(isDark, isOled, isSunny, isCosmic) : 'inherit',
        transition: 'color 0.15s',
      }} />

      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        maxWidth: showLabel ? '8rem' : '0rem',
        opacity: showLabel ? 1 : 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        transition: T_LABEL,
        fontFamily: (usePixelFont || pfcMode || isOnChat) ? 'var(--font-heading)' : 'inherit',
        fontSize: (pfcMode || isOnChat) ? '0.625rem' : undefined,
      }}>
        {labelText}
        {usePixelFont && twCursor && (
          <span style={{
            display: 'inline-block',
            width: '1.5px',
            height: '0.625rem',
            backgroundColor: 'var(--pfc-accent)',
            marginLeft: '1px',
            flexShrink: 0,
          }} />
        )}
      </span>

      {/* Lab Engine badges — only in pfcMode */}
      {pfcMode && (
        <>
          <span style={{
            width: 3, height: 3, borderRadius: '50%', flexShrink: 0,
            background: isOled ? 'rgba(140,140,140,0.25)' : isDark ? 'rgba(155,150,137,0.25)' : isSunny ? 'color-mix(in srgb, var(--foreground) 20%, transparent)' : 'rgba(255,255,255,0.2)',
          }} />

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.125rem 0.375rem', borderRadius: '9999px',
            background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(var(--pfc-accent-rgb), 0.06)',
            fontSize: '0.5625rem', fontFamily: 'var(--font-mono)',
            color: isDark ? 'rgba(var(--pfc-accent-rgb), 0.7)' : 'rgba(var(--pfc-accent-rgb), 0.8)',
          }}>
            {inferenceMode === 'local'
              ? <ServerIcon style={{ height: '0.5625rem', width: '0.5625rem' }} />
              : <WifiIcon style={{ height: '0.5625rem', width: '0.5625rem' }} />
            }
            {modeInfo.label}
          </span>

          <SteeringIndicator />

          {isProcessing && activeStage && (
            <span
              className="animate-pipeline-pulse"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.125rem 0.375rem', borderRadius: '9999px',
                background: isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(var(--pfc-accent-rgb), 0.06)',
                fontSize: '0.5625rem', fontFamily: 'var(--font-mono)',
                color: 'var(--pfc-accent)',
              }}
            >
              <ActivityIcon style={{ height: '0.5625rem', width: '0.5625rem' }} />
              {activeStage.replace('_', '-')}
            </span>
          )}

        </>
      )}
    </button>
  );
});

/* ═══════════════════════════════════════════════════════════════════
   TopNav — floating bubbles, zero layout animations
   ═══════════════════════════════════════════════════════════════════ */
export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, isOled, isSunny, isSunset, isCosmic, mounted } = useIsDark();
  const currentChatId = usePFCStore((s) => s.currentChatId);

  // Derived values (after all hooks)
  const isOnChat = pathname.startsWith('/chat');

  const handleNavigate = useCallback((href: string) => {
    if (href === '/') {
      // Home always goes to landing
      if (pathname === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      router.push('/');
      return;
    }

    // Chat nav — go to the last chat, or landing if no chat exists
    if (href === '/chat') {
      if (currentChatId) {
        router.push(`/chat/${currentChatId}`);
      } else {
        router.push('/');
      }
      return;
    }

    // Already on this page — scroll to top
    if (pathname === href) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    router.push(href);
  }, [router, pathname, currentChatId]);

  // Prefetch all nav routes on mount so pages are compiled before click
  useEffect(() => {
    const routes = NAV_ITEMS.map((item) => item.href);
    // Also prefetch remaining standalone routes (analytics sub-pages are now components, not routes)
    const extraRoutes = [
      '/research-copilot', '/concept-atlas', '/library',
    ];
    for (const route of [...routes, ...extraRoutes]) {
      router.prefetch(route);
    }
  }, [router]);

  // Notes page: show nav but skip analytics expansion logic
  // (notes has its own floating toolbar for notes-specific controls)

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 'var(--z-nav)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0) scale(1) translateZ(0)' : 'translateY(-8px) scale(0.97) translateZ(0)',
        transition: `opacity 0.3s cubic-bezier(0.2, 0, 0, 1), transform 0.3s cubic-bezier(0.2, 0, 0, 1)`,
        contain: 'layout paint',
        isolation: 'isolate',
        padding: '0.625rem 1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.1875rem',
          borderRadius: '9999px',
          padding: '0.375rem',
          pointerEvents: 'auto',
          width: 'fit-content',
          background: isOled
            ? 'rgba(8,8,8,0.85)'
            : isCosmic
              ? 'rgba(18,16,30,0.85)'
              : isSunset
                ? 'rgba(30,18,32,0.88)'
                : isDark
                  ? 'rgba(14,12,10,0.8)'
                  : isSunny
                    ? 'var(--card)'
                    : '#000000',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: 'none',
          boxShadow: 'none',
          transform: 'translateZ(0)',
        }}
      >
        {/* Home — standard NavBubble */}
        <NavBubble
          item={NAV_ITEMS[0]!}
          isActive={pathname === '/'}
          isDark={isDark}
          isOled={isOled}
          isSunny={isSunny}
          isSunset={isSunset}
          isCosmic={isCosmic}
          onNavigate={handleNavigate}
        />

        {/* Chat / Lab Engine bubble — only visible on chat pages */}
        {isOnChat && (
          <ChatPFCBubble
            isDark={isDark}
            isOled={isOled}
            isSunny={isSunny}
            isSunset={isSunset}
            isCosmic={isCosmic}
            isOnChat={isOnChat}
            onNavigate={handleNavigate}
          />
        )}

        {/* Remaining nav items (skip Home[0] and Chat[1]) */}
        {NAV_ITEMS.slice(2).map((item) => (
          <NavBubble
            key={item.href}
            item={item}
            isActive={
              item.activePrefix
                ? pathname.startsWith(item.activePrefix)
                : pathname === item.href
            }
            isDark={isDark}
            isOled={isOled}
            isSunny={isSunny}
            isSunset={isSunset}
            isCosmic={isCosmic}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </nav>
  );
}
