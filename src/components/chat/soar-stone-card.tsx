import { useState, useCallback } from 'react';
import { useIsDark } from '@/hooks/use-is-dark';
import { commands } from '@/lib/bindings';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import {
  SearchIcon,
  LayoutGridIcon,
  FlaskConicalIcon,
  XIcon,
  SparklesIcon,
  LoaderIcon,
} from 'lucide-react';

const STONE_ICONS: Record<string, typeof SearchIcon> = {
  Clarify: SearchIcon,
  Frameworks: LayoutGridIcon,
  Empirical: FlaskConicalIcon,
};

interface SoarStoneCardProps {
  stone: { index: number; name: string; prompt: string };
  chatId: string | undefined;
  isDark: boolean;
  glassBorder: string;
}

export function SoarStoneCard({ stone, chatId, isDark, glassBorder: _glassBorder }: SoarStoneCardProps) {
  const setSoarStone = usePFCStore((s) => s.setSoarStone);
  const addToast = usePFCStore((s) => s.addToast);
  const [exploring, setExploring] = useState(false);

  const Icon = STONE_ICONS[stone.name] ?? SparklesIcon;

  const handleExplore = useCallback(async () => {
    if (!chatId) {
      addToast({ type: 'error', message: 'No active chat for SOAR stone' });
      return;
    }
    setExploring(true);
    const res = await commands.runSoarStone(chatId, stone.prompt);
    setExploring(false);
    if (res.status === 'ok') {
      setSoarStone(null);
    } else {
      addToast({ type: 'error', message: 'SOAR stone failed' });
    }
  }, [chatId, stone.prompt, setSoarStone, addToast]);

  const handleDismiss = useCallback(() => {
    setSoarStone(null);
  }, [setSoarStone]);

  const { isOled } = useIsDark();
  const accentBg = isDark ? 'rgba(var(--pfc-accent-rgb), 0.08)' : 'rgba(var(--pfc-accent-rgb), 0.06)';
  const accentBorder = isDark ? 'rgba(var(--pfc-accent-rgb), 0.15)' : 'rgba(var(--pfc-accent-rgb), 0.12)';
  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  return (
    <>
      <div
        className="animate-spring-up"
        style={{
          margin: '0.375rem 0.5rem',
          padding: '0.625rem 0.75rem',
          borderRadius: 12,
          background: accentBg,
          border: `1px solid ${accentBorder}`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon style={{ width: 13, height: 13, color: 'var(--pfc-accent)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pfc-accent)' }}>
              SOAR Stone {stone.index + 1}
            </span>
            <span style={{ fontSize: 10, color: mutedColor }}>
              {stone.name}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 999, border: 'none',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: mutedColor, cursor: 'pointer',
            }}
          >
            <XIcon style={{ width: 10, height: 10 }} />
          </button>
        </div>

        {/* Prompt preview */}
        <p style={{
          fontSize: 11.5, lineHeight: 1.5, color: isDark ? 'rgba(232,228,222,0.8)' : 'rgba(0,0,0,0.6)',
          marginBottom: 8, maxHeight: 60, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>
          {stone.prompt}
        </p>

        {/* Action */}
        <button
          onClick={handleExplore}
          disabled={exploring || !chatId}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 999, border: 'none',
            background: exploring ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'var(--pfc-accent)',
            color: exploring ? mutedColor : '#fff',
            fontSize: 10.5, fontWeight: 600, cursor: exploring ? 'wait' : 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'all 0.18s',
          }}
        >
          {exploring
            ? <LoaderIcon style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
            : <SparklesIcon style={{ width: 11, height: 11 }} />}
          {exploring ? 'Exploring...' : 'Explore'}
        </button>
      </div>
    </>
  );
}
