import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LibraryIcon, SearchIcon, TagIcon, LightbulbIcon, QuoteIcon, BookOpenIcon,
  FileTextIcon, LoaderIcon, NetworkIcon, ExternalLinkIcon, UsersIcon, WrenchIcon,
  GlobeIcon, SparklesIcon, CheckCircleIcon, BookmarkIcon,
  PlayIcon, FastForwardIcon, RotateCcwIcon,
} from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useNavigate } from 'react-router-dom';
import { PageShell, Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { Input } from '@/components/ui/input';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import type { GraphNode, GraphNodeType, GraphEdge, HybridSearchResult, NodeDetails, SemanticHit, Page, ResearchStatus } from '@/lib/bindings';

type LibraryTab = 'sources' | 'authors' | 'tools';

const NODE_TYPE_CONFIG: Record<GraphNodeType, { icon: typeof TagIcon; label: string; color: string }> = {
  Note:   { icon: FileTextIcon,  label: 'Notes',   color: '#5E9EFF' },
  Chat:   { icon: BookOpenIcon,  label: 'Chats',   color: '#8E8E93' },
  Idea:   { icon: LightbulbIcon, label: 'Ideas',   color: '#FFD60A' },
  Source: { icon: BookOpenIcon,  label: 'Sources', color: '#30D158' },
  Folder: { icon: LibraryIcon,   label: 'Folders', color: '#AC8E68' },
  Quote:  { icon: QuoteIcon,     label: 'Quotes',  color: '#BF5AF2' },
  Tag:    { icon: TagIcon,       label: 'Tags',    color: '#FF9F0A' },
  Block:  { icon: FileTextIcon,  label: 'Blocks',  color: '#64D2FF' },
};

type FilterType = 'all' | GraphNodeType;

export default function LibraryPage() {
  const { isDark, isOled } = useIsDark();
  const addToast = usePFCStore((s) => s.addToast);
  const setActivePage = usePFCStore((s) => s.setActivePage);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<LibraryTab>('sources');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HybridSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Entity extraction
  const [extracting, setExtracting] = useState(false);

  // Node inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetails, setNodeDetails] = useState<NodeDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [nodeSummary, setNodeSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [semanticHits, setSemanticHits] = useState<SemanticHit[] | null>(null);
  const [findingSimilar, setFindingSimilar] = useState(false);

  // Research pipeline
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Array<{ stage: string; analysis: string }>>([]);
  const analysisEndRef = useRef<HTMLDivElement>(null);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  // Load graph on mount
  useEffect(() => {
    (async () => {
      const res = await commands.getGraph();
      if (res.status === 'ok') {
        setNodes(res.data.nodes);
        setEdges(res.data.edges);
      }
      setLoading(false);
    })();
  }, []);

  // Type counts
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<GraphNodeType, number>> = {};
    for (const n of nodes) {
      counts[n.node_type] = (counts[n.node_type] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    let result = filter === 'all' ? nodes : nodes.filter((n) => n.node_type === filter);
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes, filter]);

  // Edge count per node
  const edgeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of edges) {
      map.set(e.source_node_id, (map.get(e.source_node_id) ?? 0) + 1);
      map.set(e.target_node_id, (map.get(e.target_node_id) ?? 0) + 1);
    }
    return map;
  }, [edges]);

  // Search handler
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const res = await commands.searchHybrid(q, 20);
    setSearching(false);
    if (res.status === 'ok') {
      setSearchResults(res.data);
    } else {
      addToast({ type: 'error', message: 'Search failed' });
    }
  }, [searchQuery, addToast]);

  // Entity extraction — listen for completion event instead of hardcoded delay
  const handleExtract = useCallback(async () => {
    setExtracting(true);
    const res = await commands.extractEntities(false);
    if (res.status === 'ok') {
      addToast({ type: 'success', message: 'Entity extraction running…' });
    } else {
      setExtracting(false);
      addToast({ type: 'error', message: 'Entity extraction failed' });
    }
  }, [addToast]);

  // Listen for extraction completion to refresh graph
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<{ phase: string; current: number; total: number }>('extraction://progress', async (event) => {
      if (event.payload.phase === 'complete') {
        setExtracting(false);
        const graphRes = await commands.getGraph();
        if (graphRes.status === 'ok') {
          setNodes(graphRes.data.nodes);
          setEdges(graphRes.data.edges);
          addToast({ type: 'success', message: `Graph updated: ${graphRes.data.nodes.length} nodes` });
        }
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [addToast]);

  // Navigate to a note — set active page in store THEN navigate
  const goToNote = useCallback((sourceId: string) => {
    setActivePage(sourceId);
    navigate('/notes');
  }, [setActivePage, navigate]);

  // Node inspector — fetch details on click
  const inspectNode = useCallback(async (nodeId: string) => {
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
      setNodeDetails(null);
      setNodeSummary(null);
      setSemanticHits(null);
      return;
    }
    setSelectedNodeId(nodeId);
    setNodeDetails(null);
    setNodeSummary(null);
    setSemanticHits(null);
    setLoadingDetails(true);
    const res = await commands.getNodeDetails(nodeId);
    setLoadingDetails(false);
    if (res.status === 'ok') setNodeDetails(res.data);
  }, [selectedNodeId]);

  // Summarize node
  const handleSummarize = useCallback(async (nodeId: string) => {
    setSummarizing(true);
    setNodeSummary(null);

    // Listen for the summary event dispatched by tauri-bridge
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; summary: string } | undefined;
      if (detail?.nodeId === nodeId) {
        setNodeSummary(detail.summary);
        setSummarizing(false);
      }
    };
    window.addEventListener('pfc-node-summary', handler);

    await commands.summarizeNode(nodeId);

    // Cleanup listener after 30s timeout
    setTimeout(() => {
      window.removeEventListener('pfc-node-summary', handler);
      setSummarizing(false);
    }, 30000);
  }, []);

  // Find semantically similar nodes
  const handleFindSimilar = useCallback(async (nodeId: string) => {
    const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex === -1) return;
    setFindingSimilar(true);
    setSemanticHits(null);
    const res = await commands.semanticNeighbors(nodeIndex, 8, 0.3);
    setFindingSimilar(false);
    if (res.status === 'ok') {
      setSemanticHits(res.data);
    } else {
      addToast({ type: 'error', message: 'Semantic search failed' });
    }
  }, [nodes, addToast]);

  // Load pages list when tools tab is active
  useEffect(() => {
    if (activeTab !== 'tools') return;
    commands.listPages().then((res) => {
      if (res.status === 'ok') setPages(res.data);
    });
  }, [activeTab]);

  // Listen for research analysis events
  useEffect(() => {
    if (activeTab !== 'tools') return;
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<{ page_id: string; stage: string; analysis: string }>('research://analysis', (event) => {
        const { page_id, stage, analysis } = event.payload;
        if (selectedPageId && page_id === selectedPageId) {
          setAnalysisResults((prev) => [...prev, { stage, analysis }]);
          setResearchLoading(false);
          // Auto-scroll to latest result
          setTimeout(() => analysisEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }),
      listen<{ page_id: string; message: string }>('research://error', (event) => {
        if (selectedPageId && event.payload.page_id === selectedPageId) {
          setResearchLoading(false);
          addToast({ type: 'error', message: event.payload.message });
        }
      }),
    ];
    return () => { unlisteners.forEach((p) => p.then((u) => u())); };
  }, [activeTab, selectedPageId, addToast]);

  // Fetch research status when a page is selected
  const handleSelectPage = useCallback(async (pageId: string) => {
    setSelectedPageId(pageId);
    setResearchStatus(null);
    setAnalysisResults([]);
    const res = await commands.getResearchStatus(pageId);
    if (res.status === 'ok') setResearchStatus(res.data);
  }, []);

  const handleStartResearch = useCallback(async () => {
    if (!selectedPageId) return;
    setResearchLoading(true);
    const res = await commands.startResearch(selectedPageId, null);
    if (res.status === 'ok') {
      setResearchStatus(res.data);
      addToast({ type: 'success', message: `Research started: ${res.data.title}` });
    } else {
      addToast({ type: 'error', message: 'Failed to start research' });
    }
    setResearchLoading(false);
  }, [selectedPageId, addToast]);

  const handleAdvanceResearch = useCallback(async () => {
    if (!selectedPageId) return;
    setResearchLoading(true);
    const res = await commands.advanceResearch(selectedPageId);
    if (res.status === 'ok') {
      setResearchStatus(res.data);
      // Analysis event will arrive asynchronously — keep loading until then
    } else {
      setResearchLoading(false);
      addToast({ type: 'error', message: 'Failed to advance research' });
    }
  }, [selectedPageId, addToast]);

  const handleResetResearch = useCallback(async () => {
    if (!selectedPageId) return;
    // Reset by starting fresh
    setResearchStatus(null);
    setAnalysisResults([]);
    const res = await commands.getResearchStatus(selectedPageId);
    if (res.status === 'ok') setResearchStatus(res.data);
  }, [selectedPageId]);

  const RESEARCH_STAGES = ['None', 'Gathering', 'Analyzing', 'Synthesizing', 'Complete'];

  const filterTypes: FilterType[] = ['all', 'Note', 'Idea', 'Source', 'Quote', 'Tag', 'Chat', 'Folder', 'Block'];

  return (
    <PageShell icon={LibraryIcon} title="Library" subtitle="Sources, authors, and research tools">
      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.25rem' }}>
        <GlassBubbleButton active={activeTab === 'sources'} onClick={() => setActiveTab('sources')} size="md">
          <BookmarkIcon style={{ width: 14, height: 14 }} />
          Sources
        </GlassBubbleButton>
        <GlassBubbleButton active={activeTab === 'authors'} onClick={() => setActiveTab('authors')} size="md">
          <UsersIcon style={{ width: 14, height: 14 }} />
          Authors
        </GlassBubbleButton>
        <GlassBubbleButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} size="md">
          <WrenchIcon style={{ width: 14, height: 14 }} />
          Research Tools
        </GlassBubbleButton>
      </div>

      {activeTab === 'sources' && (
        <>
      {/* ── Search ── */}
      <Section>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search across all knowledge…"
            style={{
              flex: 1,
              background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.8125rem',
            }}
          />
          <GlassBubbleButton onClick={handleSearch} disabled={searching} size="sm">
            {searching
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <SearchIcon style={{ width: 12, height: 12 }} />}
            Search
          </GlassBubbleButton>
        </div>

        {/* Search results */}
        {searchResults && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', color: mutedColor, marginBottom: '0.5rem' }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
            {searchResults.map((r) => (
              <button
                key={r.page_id}
                onClick={() => goToNote(r.page_id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.625rem',
                  marginBottom: '0.25rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'inherit',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{r.title}</span>
                  <span style={{
                    fontSize: '0.625rem',
                    color: mutedColor,
                    padding: '0.0625rem 0.375rem',
                    borderRadius: '0.25rem',
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  }}>
                    {r.source}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: mutedColor, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                </div>
                {r.snippet && (
                  <p style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '0.125rem', lineHeight: 1.4 }}>
                    {r.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Graph Overview ── */}
      <Section title="Knowledge Graph">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LoaderIcon style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8125rem', color: mutedColor }}>Loading graph…</span>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {nodes.length}
                </span>
                <span style={{ fontSize: '0.75rem', color: mutedColor, marginLeft: '0.375rem' }}>nodes</span>
              </div>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {edges.length}
                </span>
                <span style={{ fontSize: '0.75rem', color: mutedColor, marginLeft: '0.375rem' }}>edges</span>
              </div>
              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {Object.keys(typeCounts).length}
                </span>
                <span style={{ fontSize: '0.75rem', color: mutedColor, marginLeft: '0.375rem' }}>types</span>
              </div>
            </div>

            {/* Type filter pills */}
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {filterTypes.map((t) => {
                const count = t === 'all' ? nodes.length : (typeCounts[t] ?? 0);
                if (t !== 'all' && count === 0) return null;
                const active = filter === t;
                return (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: '1rem',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: active ? 600 : 400,
                      background: active
                        ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
                        : 'transparent',
                      color: active
                        ? (t !== 'all' ? NODE_TYPE_CONFIG[t].color : 'var(--pfc-accent)')
                        : mutedColor,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t === 'all' ? 'All' : NODE_TYPE_CONFIG[t].label}
                    <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Node list */}
            <div style={{
              maxHeight: '24rem',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}>
              {filteredNodes.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: mutedColor, padding: '1rem 0' }}>
                  No entities found. Run entity extraction to populate the graph.
                </p>
              ) : (
                filteredNodes.map((node) => {
                  const cfg = NODE_TYPE_CONFIG[node.node_type];
                  const Icon = cfg.icon;
                  const links = edgeCountMap.get(node.id) ?? 0;
                  const isNote = node.node_type === 'Note';
                  const isSelected = selectedNodeId === node.id;
                  return (
                    <div key={node.id}>
                      <button
                        onClick={() => inspectNode(node.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.5rem',
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderRadius: '0.375rem',
                          background: isSelected
                            ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
                            : 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Icon style={{ width: 14, height: 14, color: cfg.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {node.label}
                        </span>
                        {links > 0 && (
                          <span style={{ fontSize: '0.6875rem', color: mutedColor, fontVariantNumeric: 'tabular-nums' }}>
                            {links} link{links !== 1 ? 's' : ''}
                          </span>
                        )}
                        {isNote && (
                          <ExternalLinkIcon style={{ width: 10, height: 10, color: mutedColor, flexShrink: 0 }} />
                        )}
                      </button>

                      {/* Node Inspector Panel */}
                      {isSelected && (
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          marginBottom: '0.25rem',
                          borderRadius: '0.375rem',
                          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                          fontSize: '0.75rem',
                        }}>
                          {loadingDetails ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: mutedColor }}>
                              <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                              Loading details…
                            </div>
                          ) : nodeDetails ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <span><strong>Type:</strong> {nodeDetails.node_type}</span>
                                <span><strong>Weight:</strong> {nodeDetails.weight.toFixed(2)}</span>
                                <span><strong>Links:</strong> {nodeDetails.link_count}</span>
                              </div>

                              {nodeDetails.content_preview && (
                                <div style={{ color: mutedColor, lineHeight: 1.4, maxHeight: '4rem', overflow: 'hidden' }}>
                                  {nodeDetails.content_preview.slice(0, 200)}{nodeDetails.content_preview.length > 200 ? '…' : ''}
                                </div>
                              )}

                              {nodeDetails.neighbors.length > 0 && (
                                <div>
                                  <div style={{ color: mutedColor, marginBottom: '0.125rem' }}>
                                    Neighbors ({nodeDetails.neighbors.length}):
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {nodeDetails.neighbors.slice(0, 10).map((n) => {
                                      const nCfg = NODE_TYPE_CONFIG[n.node_type];
                                      return (
                                        <button
                                          key={n.node_id}
                                          onClick={(e) => { e.stopPropagation(); inspectNode(n.node_id); }}
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.125rem',
                                            padding: '0.125rem 0.375rem', borderRadius: '0.75rem', border: 'none',
                                            fontSize: '0.6875rem', cursor: 'pointer', color: nCfg.color,
                                            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                          }}
                                        >
                                          {n.label}
                                        </button>
                                      );
                                    })}
                                    {nodeDetails.neighbors.length > 10 && (
                                      <span style={{ fontSize: '0.6875rem', color: mutedColor }}>
                                        +{nodeDetails.neighbors.length - 10} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.25rem' }}>
                                <GlassBubbleButton
                                  onClick={() => handleSummarize(node.id)}
                                  disabled={summarizing}
                                  size="sm"
                                >
                                  {summarizing
                                    ? <LoaderIcon style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />
                                    : <LightbulbIcon style={{ width: 10, height: 10 }} />}
                                  Summarize
                                </GlassBubbleButton>
                                <GlassBubbleButton
                                  onClick={() => handleFindSimilar(node.id)}
                                  disabled={findingSimilar}
                                  size="sm"
                                >
                                  {findingSimilar
                                    ? <LoaderIcon style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />
                                    : <NetworkIcon style={{ width: 10, height: 10 }} />}
                                  Similar
                                </GlassBubbleButton>
                                {isNote && (
                                  <GlassBubbleButton onClick={() => goToNote(node.source_id)} size="sm">
                                    <ExternalLinkIcon style={{ width: 10, height: 10 }} />
                                    Open Note
                                  </GlassBubbleButton>
                                )}
                              </div>

                              {/* Summary result */}
                              {nodeSummary && (
                                <div style={{
                                  padding: '0.375rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  background: isDark ? 'rgba(94,158,255,0.08)' : 'rgba(94,158,255,0.06)',
                                  color: isDark ? '#B0C8E8' : '#3A5F8A',
                                  lineHeight: 1.5,
                                }}>
                                  {nodeSummary}
                                </div>
                              )}

                              {/* Semantic neighbors */}
                              {semanticHits && semanticHits.length > 0 && (
                                <div>
                                  <div style={{ color: mutedColor, marginBottom: '0.125rem' }}>
                                    Similar ({semanticHits.length}):
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {semanticHits.map((hit) => {
                                      const hitCfg = NODE_TYPE_CONFIG[hit.node_type];
                                      return (
                                        <button
                                          key={hit.node_id}
                                          onClick={(e) => { e.stopPropagation(); inspectNode(hit.node_id); }}
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                            padding: '0.125rem 0.375rem', borderRadius: '0.75rem', border: 'none',
                                            fontSize: '0.6875rem', cursor: 'pointer', color: hitCfg.color,
                                            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                          }}
                                        >
                                          {hit.label}
                                          <span style={{ fontSize: '0.5625rem', opacity: 0.6 }}>
                                            {(hit.similarity * 100).toFixed(0)}%
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {semanticHits && semanticHits.length === 0 && (
                                <div style={{ color: mutedColor, fontSize: '0.6875rem' }}>
                                  No similar nodes found (embeddings may not be computed yet)
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: mutedColor }}>Failed to load details</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </Section>

      {/* ── Actions ── */}
      <Section title="Actions">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <GlassBubbleButton onClick={handleExtract} disabled={extracting} size="sm">
            {extracting
              ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              : <NetworkIcon style={{ width: 12, height: 12 }} />}
            Extract Entities
          </GlassBubbleButton>
          <GlassBubbleButton onClick={() => navigate('/graph')} size="sm">
            <ExternalLinkIcon style={{ width: 12, height: 12 }} />
            Open Graph View
          </GlassBubbleButton>
        </div>
        <p style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.5rem' }}>
          Entity extraction scans your notes for ideas, sources, quotes, and tags using AI.
        </p>
      </Section>
        </>
      )}

      {activeTab === 'authors' && (
        <Section title="Thinkers & Authors">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '3rem 1rem',
            gap: '1rem',
          }}>
            <UsersIcon style={{ width: 48, height: 48, color: mutedColor, opacity: 0.4 }} />
            <p style={{ fontSize: '0.875rem', color: mutedColor, textAlign: 'center', maxWidth: '24rem' }}>
              Track authors and thinkers whose work influences your knowledge graph.
              This feature requires backend research commands.
            </p>
            <span style={{
              fontSize: '0.6875rem',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: mutedColor,
            }}>
              Coming Soon
            </span>
          </div>
        </Section>
      )}

      {activeTab === 'tools' && (
        <Section title="Research Pipeline">
          {/* Note selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', color: mutedColor, display: 'block', marginBottom: '0.25rem' }}>
              Select a note to research
            </label>
            <select
              value={selectedPageId ?? ''}
              onChange={(e) => e.target.value && handleSelectPage(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                border: 'none',
                fontSize: '0.8125rem',
                background: isOled ? 'rgba(25,25,25,0.8)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="">— Choose a note —</option>
              {pages.filter((p) => !p.is_archived).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ''}{p.title || 'Untitled'}
                </option>
              ))}
            </select>
          </div>

          {/* Stage progress bar */}
          {selectedPageId && researchStatus && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                {RESEARCH_STAGES.map((label, i) => {
                  const active = researchStatus.stage >= i;
                  const current = researchStatus.stage === i;
                  return (
                    <div
                      key={label}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{
                        width: '100%',
                        height: '0.25rem',
                        borderRadius: '0.125rem',
                        background: active
                          ? (current ? 'var(--pfc-accent, #5E9EFF)' : 'rgba(94,158,255,0.4)')
                          : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                        transition: 'background 0.3s ease',
                      }} />
                      <span style={{
                        fontSize: '0.5625rem',
                        color: active ? (current ? 'var(--pfc-accent, #5E9EFF)' : 'inherit') : mutedColor,
                        fontWeight: current ? 700 : 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.025em',
                      }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '1rem',
                  background: researchStatus.stage === 4
                    ? 'rgba(48,209,88,0.15)' : 'rgba(94,158,255,0.12)',
                  color: researchStatus.stage === 4 ? '#30D158' : 'var(--pfc-accent, #5E9EFF)',
                  fontWeight: 600,
                }}>
                  Stage {researchStatus.stage}/4: {researchStatus.stage_name}
                </span>
                <span style={{ fontSize: '0.75rem', color: mutedColor }}>
                  {researchStatus.title}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {selectedPageId && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {(!researchStatus || researchStatus.stage === 0) ? (
                <GlassBubbleButton
                  onClick={handleStartResearch}
                  disabled={researchLoading}
                  size="sm"
                >
                  {researchLoading
                    ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                    : <PlayIcon style={{ width: 12, height: 12 }} />}
                  Start Research
                </GlassBubbleButton>
              ) : (
                <>
                  <GlassBubbleButton
                    onClick={handleAdvanceResearch}
                    disabled={researchLoading || researchStatus.stage >= 4}
                    size="sm"
                  >
                    {researchLoading
                      ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                      : <FastForwardIcon style={{ width: 12, height: 12 }} />}
                    {researchStatus.stage >= 4 ? 'Complete' : 'Advance Stage'}
                  </GlassBubbleButton>
                  <GlassBubbleButton
                    onClick={handleResetResearch}
                    disabled={researchLoading}
                    size="sm"
                  >
                    <RotateCcwIcon style={{ width: 12, height: 12 }} />
                    Refresh
                  </GlassBubbleButton>
                </>
              )}
            </div>
          )}

          {/* Analysis results */}
          {analysisResults.length > 0 && (
            <div style={{
              maxHeight: '20rem',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              {analysisResults.map((result, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: isDark ? 'rgba(94,158,255,0.06)' : 'rgba(94,158,255,0.04)',
                  }}
                >
                  <div style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--pfc-accent, #5E9EFF)',
                    marginBottom: '0.375rem',
                  }}>
                    {result.stage} Analysis
                  </div>
                  <div style={{
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    color: isDark ? 'rgba(220,220,220,0.9)' : 'rgba(30,30,30,0.85)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {result.analysis}
                  </div>
                </div>
              ))}
              <div ref={analysisEndRef} />
            </div>
          )}

          {/* Empty state when no page selected */}
          {!selectedPageId && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '2rem 1rem',
              gap: '0.75rem',
            }}>
              <SparklesIcon style={{ width: 36, height: 36, color: mutedColor, opacity: 0.4 }} />
              <p style={{ fontSize: '0.8125rem', color: mutedColor, textAlign: 'center', maxWidth: '22rem' }}>
                Select a note above to run multi-stage research analysis. Each stage uses AI to
                gather evidence, analyze claims, synthesize findings, and produce a final verdict.
              </p>
            </div>
          )}

          {/* Stage descriptions */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
            gap: '0.5rem',
            marginTop: '1rem',
          }}>
            {[
              { icon: GlobeIcon, label: 'Gathering', desc: 'Collect sources & evidence', stage: 1 },
              { icon: SearchIcon, label: 'Analyzing', desc: 'Deep claim analysis', stage: 2 },
              { icon: NetworkIcon, label: 'Synthesizing', desc: 'Cross-reference findings', stage: 3 },
              { icon: CheckCircleIcon, label: 'Complete', desc: 'Final verdict & grades', stage: 4 },
            ].map(({ icon: StageIcon, label, desc, stage }) => {
              const reached = researchStatus ? researchStatus.stage >= stage : false;
              return (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.75rem 0.5rem',
                    borderRadius: '0.5rem',
                    background: reached
                      ? (isDark ? 'rgba(94,158,255,0.06)' : 'rgba(94,158,255,0.04)')
                      : (isOled ? 'rgba(25,25,25,0.6)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                    textAlign: 'center',
                    opacity: reached ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <StageIcon style={{
                    width: 18, height: 18,
                    color: reached ? 'var(--pfc-accent, #5E9EFF)' : mutedColor,
                  }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: '0.625rem', color: mutedColor }}>{desc}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </PageShell>
  );
}
