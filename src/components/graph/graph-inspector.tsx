import { motion, AnimatePresence } from 'framer-motion';
import {
  BoxIcon, XIcon, CalendarIcon, LinkIcon, FileTextIcon,
} from 'lucide-react';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { physicsSpring } from '@/lib/motion/motion-config';
import { NODE_COLORS, NODE_ICONS } from '@/components/graph/graph-canvas';
import type { GraphNode, NeighborInfo } from '@/lib/bindings';

export function GraphInspector({
  node,
  details,
  nodes,
  onClose,
  onSelectNeighbor,
  onOpenNote,
  isDark,
  isOled,
}: {
  node: GraphNode | null;
  details: { content: string; neighbors: NeighborInfo[] } | null;
  nodes: GraphNode[];
  onClose: () => void;
  onSelectNeighbor: (node: GraphNode) => void;
  onOpenNote: (sourceId: string) => void;
  isDark: boolean;
  isOled: boolean;
}) {
  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)';
  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)';

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={physicsSpring.card}
          style={{
            position: 'absolute', top: '4rem', right: '0.75rem',
            width: '18rem', maxHeight: 'calc(100vh - 8rem)', zIndex: 20,
            background: panelBg, backdropFilter: 'blur(24px) saturate(1.5)',
            border: panelBorder, borderRadius: '0.75rem',
            overflow: 'auto', padding: '1rem',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(() => { const Icon = NODE_ICONS[node.node_type] ?? BoxIcon; return <Icon style={{ width: 16, height: 16, color: NODE_COLORS[node.node_type] ?? mutedColor, flexShrink: 0, marginTop: 2 }} />; })()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>
                {node.label}
              </h3>
              <div style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: NODE_COLORS[node.node_type] }}>{node.node_type}</span>
                <span>wt: {node.weight.toFixed(1)}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedColor, padding: 2, flexShrink: 0 }}
            >
              <XIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Created date */}
          {node.created_at > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.625rem', color: mutedColor, marginBottom: '0.75rem' }}>
              <CalendarIcon style={{ width: 10, height: 10 }} />
              {new Date(node.created_at).toLocaleDateString()}
            </div>
          )}

          {/* Content preview */}
          {details?.content && (
            <div style={{
              fontSize: '0.6875rem', color: mutedColor, marginBottom: '0.75rem',
              padding: '0.5rem', borderRadius: '0.5rem', lineHeight: 1.5,
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              maxHeight: '8rem', overflow: 'auto',
            }}>
              {details.content.slice(0, 400)}
              {details.content.length > 400 && '\u2026'}
            </div>
          )}

          {/* Connections */}
          {details?.neighbors && details.neighbors.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.625rem', color: mutedColor, marginBottom: '0.375rem' }}>
                <LinkIcon style={{ width: 10, height: 10 }} />
                {details.neighbors.length} connections
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                {details.neighbors.slice(0, 8).map((nb) => {
                  const neighbor = nodes.find((n) => n.id === nb.node_id);
                  const NIcon = NODE_ICONS[nb.node_type] ?? BoxIcon;
                  return (
                    <button
                      key={nb.node_id}
                      onClick={() => { if (neighbor) onSelectNeighbor(neighbor); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0.25rem 0.375rem', borderRadius: '0.25rem',
                        border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                        background: 'transparent', color: 'inherit', fontSize: '0.6875rem',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <NIcon style={{ width: 10, height: 10, color: NODE_COLORS[nb.node_type] ?? mutedColor }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {nb.label}
                      </span>
                      <span style={{ fontSize: '0.5625rem', color: mutedColor, flexShrink: 0 }}>{nb.edge_type}</span>
                    </button>
                  );
                })}
                {details.neighbors.length > 8 && (
                  <span style={{ fontSize: '0.625rem', color: mutedColor, padding: '0.125rem 0.375rem' }}>
                    +{details.neighbors.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {node.node_type === 'Note' && (
              <GlassBubbleButton
                onClick={() => onOpenNote(node.source_id)}
                size="sm"
              >
                <FileTextIcon style={{ width: 12, height: 12 }} /> Open
              </GlassBubbleButton>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
