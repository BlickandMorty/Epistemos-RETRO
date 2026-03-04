import { motion } from 'framer-motion';
import { SearchIcon, BoxIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { physicsSpring } from '@/lib/motion/motion-config';
import { NODE_COLORS, NODE_ICONS } from '@/components/graph/graph-canvas';
import type { GraphNode } from '@/lib/bindings';

export function GraphSidebar({
  nodes,
  searchQuery,
  onSearchChange,
  searchResults,
  selectedNodeId,
  onSelectNode,
  isDark,
  isOled,
  edgeCount,
}: {
  nodes: GraphNode[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: GraphNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: GraphNode) => void;
  isDark: boolean;
  isOled: boolean;
  edgeCount: number;
}) {
  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.85)' : 'rgba(255,255,255,0.88)';
  const panelBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)';

  const displayNodes = searchQuery.trim() ? searchResults : nodes;

  return (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={physicsSpring.chatPanel}
        style={{
          position: 'absolute', top: '4rem', left: '0.75rem', bottom: '4.5rem',
          width: '16rem', zIndex: 20,
          background: panelBg, backdropFilter: 'blur(24px) saturate(1.5)',
          border: panelBorder, borderRadius: '0.75rem',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Search */}
        <div style={{ padding: '0.625rem', borderBottom: panelBorder }}>
          <div style={{ position: 'relative' }}>
            <SearchIcon style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: mutedColor, pointerEvents: 'none' }} />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search nodes..."
              style={{
                paddingLeft: '1.75rem', fontSize: '0.75rem', height: '2rem',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: '0.5rem',
              }}
            />
          </div>
        </div>

        {/* Node list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0.25rem' }}>
          {displayNodes.slice(0, 80).map((node) => {
            const Icon = NODE_ICONS[node.node_type] ?? BoxIcon;
            const isActive = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                onClick={() => onSelectNode(node)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
                  border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                  background: isActive
                    ? (isDark ? 'rgba(94,158,255,0.12)' : 'rgba(94,158,255,0.08)')
                    : 'transparent',
                  color: 'inherit', fontSize: '0.75rem',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon style={{ width: 12, height: 12, color: NODE_COLORS[node.node_type] ?? mutedColor, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {node.label}
                </span>
              </button>
            );
          })}
          {displayNodes.length > 80 && (
            <p style={{ fontSize: '0.625rem', color: mutedColor, padding: '0.375rem', textAlign: 'center' }}>
              +{displayNodes.length - 80} more
            </p>
          )}
          {displayNodes.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: mutedColor, padding: '1rem', textAlign: 'center' }}>
              {searchQuery ? 'No matches' : 'No nodes'}
            </p>
          )}
        </div>

        {/* Stats footer */}
        <div style={{ padding: '0.5rem 0.625rem', borderTop: panelBorder, fontSize: '0.625rem', color: mutedColor, display: 'flex', gap: '0.75rem' }}>
          <span>{nodes.length} nodes</span>
          <span>{edgeCount} edges</span>
        </div>
    </motion.div>
  );
}
