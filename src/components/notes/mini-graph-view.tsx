import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NetworkIcon, ArrowRightIcon } from 'lucide-react';
import { commands } from '@/lib/bindings';
import { useIsDark } from '@/hooks/use-is-dark';
import type { GraphNode, GraphEdge } from '@/lib/bindings';

interface MiniGraphStats {
  totalNodes: number;
  totalEdges: number;
  byType: Record<string, number>;
}

export default function MiniGraphView() {
  const navigate = useNavigate();
  const { isDark } = useIsDark();
  const [stats, setStats] = useState<MiniGraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const accentColor = isDark ? '#5E9EFF' : '#4f46e5';

  useEffect(() => {
    let mounted = true;
    
    async function loadGraph() {
      const res = await commands.getGraph();
      if (res.status === 'ok' && mounted) {
        const nodes = res.data.nodes;
        const edges = res.data.edges;
        
        // Calculate stats
        const byType: Record<string, number> = {};
        nodes.forEach(n => {
          byType[n.node_type] = (byType[n.node_type] || 0) + 1;
        });
        
        setStats({
          totalNodes: nodes.length,
          totalEdges: edges.length,
          byType,
        });
        
        // Draw mini visualization
        drawMiniViz(nodes, edges);
      }
      setLoading(false);
    }
    
    loadGraph();
    return () => { mounted = false; };
  }, []);

  function drawMiniViz(nodes: GraphNode[], edges: GraphEdge[]) {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Simple force-like layout - distribute nodes in a spiral
    const positions = new Map<string, { x: number; y: number }>();
    const golden = Math.PI * (3 - Math.sqrt(5));
    const centerX = w / 2;
    const centerY = h / 2;
    
    nodes.forEach((node, i) => {
      const r = 30 + Math.sqrt(i) * 15;
      const theta = i * golden;
      positions.set(node.id, {
        x: centerX + r * Math.cos(theta),
        y: centerY + r * Math.sin(theta),
      });
    });
    
    // Draw edges
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    edges.forEach(edge => {
      const src = positions.get(edge.source_node_id);
      const tgt = positions.get(edge.target_node_id);
      if (src && tgt) {
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
      }
    });
    ctx.stroke();
    
    // Draw nodes
    const nodeColors: Record<string, string> = {
      Note: '#5E9EFF', Chat: '#30D158', Idea: '#FFD60A', Source: '#FF9F0A',
      Folder: '#BF5AF2', Quote: '#FF6482', Tag: '#64D2FF', Block: '#AC8E68',
    };
    
    nodes.forEach(node => {
      const pos = positions.get(node.id);
      if (!pos) return;
      
      const r = Math.max(2, Math.min(6, Math.sqrt(node.weight)));
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeColors[node.node_type] || '#888';
      ctx.fill();
    });
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: mutedColor, fontSize: '12px' }}>Loading graph...</div>
      </div>
    );
  }

  if (!stats || stats.totalNodes === 0) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        gap: '12px',
        padding: '20px'
      }}>
        <NetworkIcon style={{ width: 32, height: 32, opacity: 0.3, color: mutedColor }} />
        <div style={{ color: mutedColor, fontSize: '12px', textAlign: 'center' }}>
          No graph nodes yet
        </div>
        <button
          onClick={() => navigate('/knowledge')}
          style={{
            padding: '6px 12px',
            fontSize: '11px',
            borderRadius: '6px',
            border: 'none',
            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            color: mutedColor,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Open Graph <ArrowRightIcon style={{ width: 10, height: 10 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Mini canvas visualization */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      
      {/* Stats footer */}
      <div style={{ 
        padding: '10px 12px',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: mutedColor }}>
            {stats.totalNodes} nodes · {stats.totalEdges} edges
          </span>
          <button
            onClick={() => navigate('/knowledge')}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              borderRadius: '4px',
              border: 'none',
              background: accentColor,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Open Graph <ArrowRightIcon style={{ width: 8, height: 8 }} />
          </button>
        </div>
        
        {/* Type breakdown */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {Object.entries(stats.byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([type, count]) => (
              <span
                key={type}
                style={{
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  color: mutedColor,
                }}
              >
                {type}: {count}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
