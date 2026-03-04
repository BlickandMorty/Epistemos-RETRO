import { motion } from 'framer-motion';
import {
  BoxIcon, PlayIcon, PauseIcon, RefreshCwIcon, Maximize2Icon, CrosshairIcon,
} from 'lucide-react';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { physicsSpring } from '@/lib/motion/motion-config';
import { NODE_COLORS, NODE_ICONS } from '@/components/graph/graph-canvas';

export function GraphControls({
  typeCounts,
  typeFilter,
  onTypeFilter,
  physicsRunning,
  onTogglePhysics,
  onRebuild,
  onZoomToFit,
  fpsMode,
  onToggleFps,
  isDark,
}: {
  typeCounts: [string, number][];
  typeFilter: string | null;
  onTypeFilter: (type: string | null) => void;
  physicsRunning: boolean;
  onTogglePhysics: () => void;
  onRebuild: () => void;
  onZoomToFit: () => void;
  fpsMode: boolean;
  onToggleFps: () => void;
  isDark: boolean;
}) {
  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)';
  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={physicsSpring.chatEnter}
      style={{
        position: 'absolute', bottom: '0.75rem', left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', alignItems: 'center', gap: '0.25rem',
        padding: '0.3125rem', borderRadius: '9999px',
        background: isDark ? 'rgba(20,19,24,0.88)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        border: panelBorder,
      }}
    >
      {/* Type filter pills */}
      <GlassBubbleButton size="sm" active={typeFilter === null} onClick={() => onTypeFilter(null)}>
        All
      </GlassBubbleButton>
      {typeCounts.map(([type, count]) => {
        const Icon = NODE_ICONS[type] ?? BoxIcon;
        return (
          <GlassBubbleButton
            key={type}
            size="sm"
            active={typeFilter === type}
            onClick={() => onTypeFilter(typeFilter === type ? null : type)}
          >
            <Icon style={{ width: 10, height: 10, color: NODE_COLORS[type] ?? mutedColor }} />
            {count}
          </GlassBubbleButton>
        );
      })}

      {/* Divider */}
      <div style={{ width: 1, height: '1.25rem', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', margin: '0 0.125rem' }} />

      {/* Physics toggle */}
      <GlassBubbleButton size="sm" active={physicsRunning} onClick={onTogglePhysics}>
        {physicsRunning ? <PauseIcon style={{ width: 10, height: 10 }} /> : <PlayIcon style={{ width: 10, height: 10 }} />}
      </GlassBubbleButton>

      {/* Rebuild */}
      <GlassBubbleButton size="sm" onClick={onRebuild}>
        <RefreshCwIcon style={{ width: 10, height: 10 }} />
      </GlassBubbleButton>

      {/* Zoom to fit */}
      <GlassBubbleButton size="sm" onClick={onZoomToFit}>
        <Maximize2Icon style={{ width: 10, height: 10 }} />
      </GlassBubbleButton>

      {/* FPS mode */}
      <GlassBubbleButton size="sm" active={fpsMode} onClick={onToggleFps}>
        <CrosshairIcon style={{ width: 10, height: 10 }} />
      </GlassBubbleButton>
    </motion.div>
  );
}
