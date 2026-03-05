# Unified Knowledge Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fuse the separate Notes (`/notes`) and Graph (`/graph`) pages into a single unified Knowledge page (`/knowledge`) with a segmented toggle, preserving every feature from both pages.

**Architecture:** A single `knowledge.tsx` page component with local `mode: 'notes' | 'graph'` state. Both modes render simultaneously but only one is visible (CSS visibility toggle, not unmount — preserves state during switches). The existing `GraphCanvas` rendering logic is extracted into a reusable component. A new graph split-editor slides in from the right when clicking a Note node in Graph mode.

**Tech Stack:** React 19, Zustand (existing 9-slice store), framer-motion (existing), Canvas 2D (existing), Tauri IPC (existing), Tailwind CSS v4 (existing)

---

## Pre-Migration Feature Inventory

### Notes Page Features (ALL must survive)
- NotesSidebar (4 views: pages, journals, books, concepts) — 1747 LOC
- BlockEditor with [[wikilink]] autocomplete + accent-colored rendering — already implemented
- TableOfContents (heading outline, scroll spy) — 537 LOC
- NoteAIChat (AI assistant, typewriter mode, concept panel, mini-graph) — 1323 LOC
- DiffSheet (version history) — 415 LOC
- Tab system: `openTabIds`, `activePageId`, bottom tab bubbles with close/hover
- Zen mode (hides sidebar, centers editor)
- Read/Write toggle
- Tools drawer (8 buttons: favorite, pin, read mode, zen mode, knowledge graph, AI chat, TOC, version history)
- Title inline edit (click → input → Enter/Escape)
- Landing state (no active page → icon + description + action buttons + recent pages grid)
- Keyboard shortcut: Cmd/Ctrl+Shift+T → toggle TOC
- Glass morphism styling on panels

### Graph Page Features (ALL must survive)
- GraphCanvas: Canvas 2D rendering with viewport culling, frame skip, label LOD, edge culling — 314 LOC
- SpatialGrid: O(1) hit detection (80px cells) — 68 LOC
- Physics positions: ref-based 90Hz updates from Rust backend — 59 LOC
- Node interaction: click (select), drag (pin/move/unpin), hover (glow)
- Camera: pan (drag), zoom (wheel 0.1–5x), zoom-to-fit (custom event)
- Left sidebar: search input + scrollable node list (80 max) + stats footer
- Right inspector: node metadata, content preview (400 chars), neighbors (8 max), "Open" action for Notes
- Bottom controls: type filter pills (8 types with counts), physics toggle, rebuild, zoom-to-fit, FPS mode
- FPS mode: pointer lock, WASD + mouse look, Space/Shift vertical, F toggle, HUD overlay
- Type filtering: All/Note/Chat/Idea/Source/Folder/Quote/Tag/Block
- Hybrid search: FTS5 + FST, debounced 300ms
- Performance tiers: low/mid/high (adaptive edge count, label LOD, DPR, physics FPS)
- Loading + empty states
- Framer-motion spring animations on all panels

### Existing Wikilink System (already works, no changes needed)
- `processContentLinks()` in `block-renderer.tsx`: detects `[[page-name]]`, wraps in `<span class="pfc-page-link">`
- CSS: `color: var(--pfc-accent)`, hover glow `text-shadow`, `cursor: pointer`, border-bottom on hover
- `PageLinkPopup`: autocomplete dropdown on `[[` input with fuzzy matching
- `handleNavigateToPage()` in `editor.tsx`: finds page by normalized title, calls `setActivePage()`, creates page if not found
- Click handler in `block-renderer.tsx`: delegates to `onNavigateToPage` callback

---

## Task 1: Extract GraphCanvas into Standalone Component

**Files:**
- Create: `src/components/graph/graph-canvas.tsx`
- Create: `src/components/graph/graph-controls.tsx`
- Create: `src/components/graph/graph-inspector.tsx`
- Create: `src/components/graph/graph-sidebar.tsx`
- Modify: `src/pages/graph.tsx` — import from new components (temporary, deleted in Task 7)

**What to do:**

The current `graph.tsx` has both `GraphCanvas` (the canvas renderer, lines 44–357) and `GraphPage` (the full page layout, lines 370–916) in one file. Extract them into focused components:

### Step 1: Create `src/components/graph/graph-canvas.tsx`

Copy the `GraphCanvas` component (lines 44–357 of graph.tsx) and the helper `hexToRgb` function (lines 359–366) into this new file. Also copy the constants: `GRAPH_QUALITY`, `NODE_COLORS`, `NODE_ICONS`.

```tsx
// src/components/graph/graph-canvas.tsx
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  NetworkIcon, FileTextIcon, LightbulbIcon, BookOpenIcon,
  HashIcon, MessageSquareIcon, FolderIcon, BoxIcon, QuoteIcon,
} from 'lucide-react';
import { commands, type GraphNode, type GraphEdge } from '@/lib/bindings';
import { getNodePositions, getPhysicsFrameCount, getFpsCamera } from '@/lib/store/physics-positions';
import { SpatialGrid } from '@/lib/graph/spatial-index';
import { PERF_TIER } from '@/lib/perf';

// Copy GRAPH_QUALITY, NODE_COLORS, NODE_ICONS, hexToRgb from graph.tsx
// Copy entire GraphCanvas component from graph.tsx lines 44-357
// Export: GraphCanvas, NODE_COLORS, NODE_ICONS, GRAPH_QUALITY, hexToRgb
```

The component's props interface stays the same:
```tsx
interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  typeFilter: string | null;
  onSelectNode: (node: GraphNode | null) => void;
  isDark: boolean;
}
```

### Step 2: Create `src/components/graph/graph-controls.tsx`

Extract the bottom floating controls bar (lines 793–869 of graph.tsx) into a standalone component:

```tsx
interface GraphControlsProps {
  nodes: GraphNode[];
  typeFilter: string | null;
  onTypeFilter: (type: string | null) => void;
  physicsRunning: boolean;
  onTogglePhysics: () => void;
  onRebuild: () => void;
  onZoomToFit: () => void;
  fpsMode: boolean;
  onToggleFps: () => void;
  isDark: boolean;
}
```

Move the `typeCounts` useMemo here. Render the type filter pills, divider, physics toggle, rebuild, zoom-to-fit, and FPS mode buttons.

### Step 3: Create `src/components/graph/graph-inspector.tsx`

Extract the right inspector panel (lines 676–791 of graph.tsx):

```tsx
interface GraphInspectorProps {
  node: GraphNode;
  details: { content: string; neighbors: NeighborInfo[] } | null;
  onClose: () => void;
  onSelectNeighbor: (node: GraphNode) => void;
  onOpenNote: (sourceId: string) => void;
  isDark: boolean;
  isOled: boolean;
}
```

### Step 4: Create `src/components/graph/graph-sidebar.tsx`

Extract the left search sidebar (lines 593–674 of graph.tsx):

```tsx
interface GraphSidebarProps {
  nodes: GraphNode[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: GraphNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: GraphNode) => void;
  onClose: () => void;
  isDark: boolean;
  isOled: boolean;
  edgeCount: number;
}
```

### Step 5: Verify graph.tsx still works

Update `graph.tsx` to import from the new component files instead of defining inline. All features must still work identically:
- Canvas rendering, node drag, camera pan/zoom
- Sidebar search, node list, stats
- Inspector panel with content + neighbors
- Bottom controls with type filters, physics toggle, rebuild, zoom, FPS
- FPS mode with pointer lock and WASD
- Loading + empty states

### Step 6: Commit

```bash
git add src/components/graph/
git add src/pages/graph.tsx
git commit -m "refactor: extract GraphCanvas and graph sub-components into reusable modules"
```

---

## Task 2: Create Knowledge Page Shell with Segmented Toggle

**Files:**
- Create: `src/pages/knowledge.tsx`
- Create: `src/components/knowledge/segmented-toggle.tsx`

**What to do:**

### Step 1: Create `src/components/knowledge/segmented-toggle.tsx`

A simple two-button toggle component. NOT a library dependency — just styled buttons matching RETRO's glass bubble aesthetic:

```tsx
import { PenLineIcon, NetworkIcon } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export type KnowledgeMode = 'notes' | 'graph';

interface SegmentedToggleProps {
  mode: KnowledgeMode;
  onModeChange: (mode: KnowledgeMode) => void;
}

export function SegmentedToggle({ mode, onModeChange }: SegmentedToggleProps) {
  const { resolvedTheme } = useTheme();
  const isDark = ['dark', 'oled', 'cosmic', 'sunset'].includes(resolvedTheme);

  // Two glass pills side by side, active one highlighted with accent
  // Match GlassBubbleButton styling: no shadows, M3 flat, backdrop blur
  // Active segment: background var(--pfc-accent) with 20% opacity, text accent color
  // Inactive segment: transparent, muted text
  return (
    <div style={{
      display: 'flex',
      gap: 2,
      padding: 2,
      borderRadius: 8,
      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    }}>
      <button
        onClick={() => onModeChange('notes')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 6, border: 'none',
          fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
          background: mode === 'notes'
            ? `rgba(var(--pfc-accent-rgb), 0.15)`
            : 'transparent',
          color: mode === 'notes'
            ? 'var(--pfc-accent)'
            : (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
          transition: 'all 0.15s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <PenLineIcon size={14} />
        Notes
      </button>
      <button
        onClick={() => onModeChange('graph')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 6, border: 'none',
          fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
          background: mode === 'graph'
            ? `rgba(var(--pfc-accent-rgb), 0.15)`
            : 'transparent',
          color: mode === 'graph'
            ? 'var(--pfc-accent)'
            : (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
          transition: 'all 0.15s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <NetworkIcon size={14} />
        Graph
      </button>
    </div>
  );
}
```

### Step 2: Create `src/pages/knowledge.tsx` shell

```tsx
import { useState } from 'react';
import { SegmentedToggle, type KnowledgeMode } from '@/components/knowledge/segmented-toggle';
import { useTheme } from '@/hooks/use-theme';

export default function KnowledgePage() {
  const [mode, setMode] = useState<KnowledgeMode>('notes');
  const { resolvedTheme } = useTheme();
  const isDark = ['dark', 'oled', 'cosmic', 'sunset'].includes(resolvedTheme);

  return (
    <div style={{
      height: '100vh', width: '100%', overflow: 'hidden',
      position: 'relative', display: 'flex', flexDirection: 'column',
    }}>
      {/* Segmented toggle bar — fixed at top */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '8px 16px', zIndex: 10,
        background: isDark ? 'rgba(20,19,24,0.6)' : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(20px) saturate(1.4)',
      }}>
        <SegmentedToggle mode={mode} onModeChange={setMode} />
      </div>

      {/* Notes Mode — visible when mode === 'notes' */}
      <div style={{
        flex: 1, display: mode === 'notes' ? 'flex' : 'none',
        overflow: 'hidden',
      }}>
        {/* Task 3 fills this in */}
        <div>Notes mode placeholder</div>
      </div>

      {/* Graph Mode — visible when mode === 'graph' */}
      <div style={{
        flex: 1, display: mode === 'graph' ? 'block' : 'none',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Task 4 fills this in */}
        <div>Graph mode placeholder</div>
      </div>
    </div>
  );
}
```

### Step 3: Commit

```bash
git add src/pages/knowledge.tsx src/components/knowledge/
git commit -m "feat: create Knowledge page shell with segmented Notes/Graph toggle"
```

---

## Task 3: Move Notes Mode into Knowledge Page

**Files:**
- Modify: `src/pages/knowledge.tsx` — add all Notes mode content
- Reference (read-only): `src/pages/notes.tsx` — source of truth for all Notes features

**What to do:**

Move ALL content from `notes.tsx` into the Notes mode panel of `knowledge.tsx`. This includes:

### Step 1: Copy all state, refs, effects, and handlers from notes.tsx

Every `useState`, `useRef`, `useEffect`, `useCallback`, and `useMemo` from `notes.tsx` must be added to `knowledge.tsx`. The complete list:

**State:**
- `toolsOpen` (boolean)
- `editorMode` ('write' | 'read')
- `zenMode` (boolean)
- `aiChatOpen` (boolean)
- `tocOpen` (boolean)
- `diffSheetOpen` (boolean)
- `isEditingTitle` (boolean)
- `titleDraft` (string)

**Store selectors:**
- `activePageId`, `notePages`, `openTabIds`, `setActivePage`, `createPage`, `deletePage`, `renamePage`, `togglePageFavorite`, `togglePagePin`, `closeTab`, `noteBooks`, `getOrCreateTodayJournal`, `addToast`

**Effects:**
- Keyboard shortcut listener (Cmd/Ctrl+Shift+T → toggle TOC)

**Refs:**
- `titleRef` (HTMLInputElement)

### Step 2: Copy all Notes mode JSX

Place inside the Notes mode `<div>`. The layout is:
1. `NotesSidebar` (left, 16rem width) — hidden when `zenMode`
2. Main content area (flex 1):
   - Title bar (page title, journal badge, inline edit)
   - `BlockEditor` (the editor itself)
   - Or: Landing state (when no active page)
3. Right tools bar (absolute positioned)
4. `TableOfContents` (right panel, conditional)
5. `NoteAIChat` (right panel, conditional)
6. `DiffSheet` (modal overlay)
7. Bottom tab bar (`TabBubble` components) — **keep at bottom** per user preference

### Step 3: Preserve all interactions

- Tab bubble click → `setActivePage(tabId)`
- Tab close → `closeTab(tabId)`
- New tab button → `createPage('Untitled')`
- Title click → inline edit mode
- All 8 tool buttons with their actions
- Landing state action buttons: New Page, Today's Journal, Knowledge Graph (this now calls `setMode('graph')` instead of `navigate('/graph')`)

### Step 4: Update the "Knowledge Graph" button in landing state

Change from `navigate('/graph')` to `setMode('graph')` since we're now on the same page.

### Step 5: Verify

All Notes features work exactly as before:
- Sidebar with 4 view tabs (pages, journals, books, concepts)
- Search with debounced hybrid search
- Block editor with wikilinks, slash menu, context menu
- TOC, AI Chat, Version History panels
- Tab system (bottom bubbles)
- Zen mode, read mode
- Title inline edit
- Landing state with action buttons

### Step 6: Commit

```bash
git add src/pages/knowledge.tsx
git commit -m "feat: migrate all Notes mode content into Knowledge page"
```

---

## Task 4: Move Graph Mode into Knowledge Page

**Files:**
- Modify: `src/pages/knowledge.tsx` — add all Graph mode content
- Reference (read-only): `src/pages/graph.tsx` — source of truth for all Graph features

**What to do:**

Move ALL graph page logic (from `GraphPage` component, lines 370–916 of graph.tsx) into the Graph mode panel of `knowledge.tsx`.

### Step 1: Copy all graph state and logic

**State to add:**
- `graphNodes` (GraphNode[])
- `graphEdges` (GraphEdge[])
- `graphLoading` (boolean)
- `graphSearchQuery` (string)
- `graphSearchResults` (GraphNode[])
- `selectedNode` (GraphNode | null)
- `nodeDetails` ({ content, neighbors } | null)
- `typeFilter` (string | null)
- `physicsRunning` (boolean)
- `graphSidebarOpen` (boolean, default true)
- `fpsMode` (boolean)

**Refs:**
- `fpsKeysRef` (Record<string, boolean>)

**Effects/Callbacks to copy:**
- `loadGraph` — fetch graph from backend, auto-rebuild if empty
- Initial load effect — call `loadGraph()` on mount
- Physics FPS setup — `setPhysicsTargetFps()`
- Auto-start physics — `startPhysics()` when nodes load, `stopPhysics()` on unmount
- Physics status poll — every 3s
- Search effect — debounced 300ms hybrid search
- `handleSelectNode` — fetch node details on select
- FPS input loop effect — WASD + mouse tracking when fpsMode active
- FPS toggle handler — toggle backend, pointer lock
- Global F key listener — toggle FPS mode
- Zoom-to-fit handler — dispatch custom event

### Step 2: Place Graph mode JSX

Inside the Graph mode `<div>`, render:
1. `GraphCanvas` component (from `src/components/graph/graph-canvas.tsx`)
2. `GraphSidebar` (left panel with search + node list)
3. `GraphInspector` (right panel with node details) — **but see Task 5 for split editor replacement**
4. `GraphControls` (bottom floating bar with type filters + controls)
5. FPS HUD (conditional, top center)
6. Sidebar toggle button (when sidebar closed)
7. Loading + empty states

### Step 3: Update "Open" action in inspector

The inspector's "Open" button for Note nodes currently calls `navigate('/notes')` and `setActivePage()`. Change to:
```tsx
setMode('notes');
setActivePage(node.source_id);
```

### Step 4: Verify

All Graph features work exactly as before:
- Canvas rendering with viewport culling, frame skip, label LOD
- Node click/drag/hover with physics pinning
- Camera pan/zoom/zoom-to-fit
- Search sidebar with node list
- Inspector panel with content + neighbors
- Type filter pills with counts
- Physics start/stop/rebuild
- FPS mode with full controls
- Performance tier adaptation
- Loading + empty states

### Step 5: Commit

```bash
git add src/pages/knowledge.tsx
git commit -m "feat: migrate all Graph mode content into Knowledge page"
```

---

## Task 5: Add Graph Split Editor

**Files:**
- Modify: `src/pages/knowledge.tsx` — add split editor logic in Graph mode

**What to do:**

When in Graph mode, clicking a Note node should slide in a `BlockEditor` panel from the right instead of (or in addition to) the inspector. This is the key Fluent feature.

### Step 1: Add split editor state

```tsx
const [graphSplitPageId, setGraphSplitPageId] = useState<string | null>(null);
```

### Step 2: Handle Note node selection in Graph mode

In `handleSelectNode`, after fetching node details, check if `node.node_type === 'Note'` and `node.source_id` exists:
```tsx
if (node.node_type === 'Note' && node.source_id) {
  setGraphSplitPageId(node.source_id);
} else {
  setGraphSplitPageId(null);
}
```

### Step 3: Render the split editor panel

After the GraphCanvas, add an `AnimatePresence` with a `motion.div` that slides in from the right:

```tsx
<AnimatePresence>
  {graphSplitPageId && (
    <motion.div
      key="graph-split-editor"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 400, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={physicsSpring.chatPanel}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        overflow: 'hidden',
        background: panelBg,
        borderLeft: panelBorder,
        backdropFilter: 'blur(24px) saturate(1.5)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header with page title + close button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: panelBorder,
      }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
          {notePages.find(p => p.id === graphSplitPageId)?.title ?? 'Note'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* "Open in Notes" button — switches to Notes mode with this tab active */}
          <button
            onClick={() => { setMode('notes'); setActivePage(graphSplitPageId); }}
            title="Open in Notes mode"
            style={{ /* small icon button */ }}
          >
            <Maximize2Icon size={14} />
          </button>
          <button onClick={() => setGraphSplitPageId(null)} style={{ /* X button */ }}>
            <XIcon size={14} />
          </button>
        </div>
      </div>

      {/* BlockEditor instance */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <BlockEditor pageId={graphSplitPageId} />
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

### Step 4: Inspector coexistence

When the split editor is open AND the selected node is a Note:
- Show the split editor (with BlockEditor)
- Hide the inspector panel
- The split editor header can show a collapsed version of node metadata (type badge, weight, neighbor count)

When the selected node is NOT a Note (Chat, Idea, Source, etc.):
- Show the inspector panel as normal
- Hide the split editor

### Step 5: Double-click to switch modes

Add `onDoubleClick` to GraphCanvas's node interaction. On double-click of a Note node:
```tsx
setMode('notes');
setActivePage(node.source_id);
```

This requires a small modification to GraphCanvas — add an `onDoubleClickNode` prop. In the mouseUp handler, track click timing for double-click detection (e.g., if two clicks within 300ms on same node).

### Step 6: Commit

```bash
git add src/pages/knowledge.tsx src/components/graph/graph-canvas.tsx
git commit -m "feat: add graph split editor with slide-in BlockEditor panel"
```

---

## Task 6: Add Cross-Mode Navigation

**Files:**
- Modify: `src/pages/knowledge.tsx` — wire up cross-mode events

**What to do:**

### Step 1: Notes → Graph navigation

In the Notes mode tools drawer, the "Knowledge Graph" button currently navigates to `/graph`. Change it to:
```tsx
onClick={() => {
  setMode('graph');
  // If there's an active note, center the graph on its node
  if (activePageId) {
    const noteNode = graphNodes.find(n => n.source_id === activePageId && n.node_type === 'Note');
    if (noteNode) {
      handleSelectNode(noteNode);
      // Optionally dispatch zoom-to-fit centered on this node
    }
  }
}}
```

### Step 2: Graph → Notes navigation (already done in Task 4/5)

- Inspector "Open" button → `setMode('notes')` + `setActivePage()`
- Split editor "Open in Notes" button → `setMode('notes')` + `setActivePage()`
- Double-click Note node → `setMode('notes')` + `setActivePage()`

### Step 3: Wikilink navigation in graph split editor

The `BlockEditor` already handles wikilink clicks via `handleNavigateToPage()` which calls `setActivePage()`. This works automatically in the split editor because:
- Clicking a `[[wikilink]]` calls `setActivePage(targetPageId)`
- The split editor reads `graphSplitPageId` state
- We need to wire it: when `setActivePage` is called from the split editor context, also update `graphSplitPageId`:

Add an effect in the Graph mode section:
```tsx
// When active page changes while in graph split mode, update split editor
useEffect(() => {
  if (mode === 'graph' && graphSplitPageId && activePageId && activePageId !== graphSplitPageId) {
    setGraphSplitPageId(activePageId);
  }
}, [activePageId, mode, graphSplitPageId]);
```

### Step 4: Commit

```bash
git add src/pages/knowledge.tsx
git commit -m "feat: wire cross-mode navigation between Notes and Graph"
```

---

## Task 7: Update Routing and Navigation

**Files:**
- Modify: `src/main.tsx` — replace routes
- Modify: `src/components/layout/top-nav.tsx` — replace nav items
- Modify: `src/components/command-palette/command-palette.tsx` — update navigation commands

**What to do:**

### Step 1: Update routes in `src/main.tsx`

Replace:
```tsx
<Route path="/notes" element={<NotesPage />} />
<Route path="/graph" element={<GraphPage />} />
```

With:
```tsx
<Route path="/knowledge" element={<KnowledgePage />} />
```

Add lazy import:
```tsx
const KnowledgePage = lazy(() => import('./pages/knowledge'));
```

Remove the lazy imports for NotesPage and GraphPage (but DON'T delete the files yet — Task 8 handles that).

### Step 2: Add redirect for old routes

Add temporary redirects so bookmarks and the command palette don't break:
```tsx
<Route path="/notes" element={<Navigate to="/knowledge" replace />} />
<Route path="/graph" element={<Navigate to="/knowledge" replace />} />
```

### Step 3: Update `top-nav.tsx`

Replace the Notes and Graph nav items with a single Knowledge item:

Find the `NAV_ITEMS` array. Replace:
```tsx
{ href: '/notes', label: 'Notes', icon: PenLineIcon, group: 'core' },
// ...
{ href: '/graph', label: 'Graph', icon: NetworkIcon, group: 'tools' },
```

With:
```tsx
{ href: '/knowledge', label: 'Knowledge', icon: BookOpenIcon, group: 'core' },
```

Import `BookOpenIcon` from `lucide-react` (or use a combined icon — `LibraryIcon` also works).

### Step 4: Update command palette

In `command-palette.tsx`, find navigation commands for Notes and Graph. Replace with a single Knowledge command. Also update any "Navigate to Notes" or "Navigate to Graph" commands.

### Step 5: Update any remaining `navigate('/notes')` or `navigate('/graph')` calls

Search the codebase for `'/notes'` and `'/graph'` route references. Update them to `'/knowledge'`. Key locations:
- Landing page buttons
- Inspector "Open" actions
- Any `useNavigate()` calls

### Step 6: Commit

```bash
git add src/main.tsx src/components/layout/top-nav.tsx src/components/command-palette/
git commit -m "feat: update routing — replace /notes and /graph with /knowledge"
```

---

## Task 8: Feature Audit and Cleanup

**Files:**
- Delete: `src/pages/notes.tsx` (after audit)
- Delete: `src/pages/graph.tsx` (after audit)
- Verify: `src/pages/knowledge.tsx` has everything

**What to do:**

### Step 1: Feature-by-feature audit of Notes

Open `notes.tsx` and `knowledge.tsx` side by side. Check each feature:

| Feature | notes.tsx Location | Migrated? |
|---------|-------------------|-----------|
| NotesSidebar render | Line 199 | ☐ |
| BlockEditor render | Line 269 | ☐ |
| TableOfContents render | Line 453-457 | ☐ |
| NoteAIChat render | Line 464-468 | ☐ |
| DiffSheet render | Line 576-582 | ☐ |
| Tab bubbles (bottom) | Lines 399-447 | ☐ |
| Tools drawer | Lines 473-566 | ☐ |
| Landing state | Lines 209-394 | ☐ |
| Zen mode toggle | Lines 486 | ☐ |
| Read/write toggle | Line 501 | ☐ |
| Title inline edit | Lines 235-265 | ☐ |
| Journal badge | Lines 224-233 | ☐ |
| Keyboard shortcut (Ctrl+Shift+T) | Lines 138-149 | ☐ |
| Sidebar animation | Lines 187-190 | ☐ |
| Glass morphism styling | Lines 415, 483 | ☐ |

### Step 2: Feature-by-feature audit of Graph

Open `graph.tsx` and `knowledge.tsx` side by side. Check each feature:

| Feature | graph.tsx Location | Migrated? |
|---------|-------------------|-----------|
| GraphCanvas render | Lines 583-590 | ☐ |
| Left sidebar (search + list) | Lines 593-674 | ☐ |
| Right inspector | Lines 676-791 | ☐ |
| Bottom controls (filters) | Lines 793-869 | ☐ |
| FPS mode HUD | Lines 871-896 | ☐ |
| Sidebar toggle button | Lines 899-913 | ☐ |
| loadGraph callback | Lines 392-414 | ☐ |
| Physics auto-start | Lines 423-436 | ☐ |
| Physics status poll | Lines 438-445 | ☐ |
| Search debounce | Lines 447-459 | ☐ |
| FPS input loop | Lines 481-519 | ☐ |
| FPS toggle + pointer lock | Lines 522-532 | ☐ |
| F key listener | Lines 534-544 | ☐ |
| Zoom to fit | Lines 546-562 | ☐ |
| Loading state | Lines 569-573 | ☐ |
| Empty state | Lines 574-581 | ☐ |
| Node type icons + colors | Lines 23-42 | ☐ |
| Performance tiers | Lines 15-21 | ☐ |

### Step 3: Run the app and verify

1. Navigate to `/knowledge` → defaults to Notes mode
2. Notes mode: all features work (sidebar, editor, tabs, TOC, AI chat, search, wikilinks, zen mode, read mode, landing state)
3. Toggle to Graph mode: all features work (canvas, physics, search, filter, inspector, FPS mode)
4. Click a Note node → split editor slides in
5. Click wikilink in split editor → split editor navigates
6. Double-click Note node → switches to Notes mode with that note open
7. Old routes `/notes` and `/graph` redirect to `/knowledge`

### Step 4: Delete old files

Only after full verification:
```bash
git rm src/pages/notes.tsx src/pages/graph.tsx
```

### Step 5: Commit

```bash
git add -A
git commit -m "feat: complete Knowledge page migration, remove old Notes and Graph pages"
```

---

## Implementation Notes

### State Organization in knowledge.tsx

The page will have a lot of state. Organize it clearly with comments:

```tsx
// ── Mode ──
const [mode, setMode] = useState<KnowledgeMode>('notes');

// ── Notes Mode State ──
const [toolsOpen, setToolsOpen] = useState(false);
const [editorMode, setEditorMode] = useState<'write' | 'read'>('write');
const [zenMode, setZenMode] = useState(false);
// ... (all Notes state)

// ── Graph Mode State ──
const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
// ... (all Graph state)

// ── Graph Split Editor ──
const [graphSplitPageId, setGraphSplitPageId] = useState<string | null>(null);
```

### Performance Consideration

Both modes are mounted simultaneously (`display: none` hides the inactive one). This means:
- Graph physics keep running when in Notes mode (the cleanup effect handles stopping on unmount, but display:none doesn't unmount)
- Solution: Pause physics when switching to Notes mode, resume when switching back:

```tsx
useEffect(() => {
  if (mode === 'graph' && graphNodes.length > 0) {
    commands.startPhysics();
    setPhysicsRunning(true);
  } else if (mode === 'notes') {
    commands.stopPhysics();
    setPhysicsRunning(false);
  }
}, [mode, graphNodes.length]);
```

### File Size Management

`knowledge.tsx` will be large (~1500+ LOC). This is acceptable because:
1. The graph sub-components are already extracted (Task 1)
2. The Notes sub-components are already separate files (NotesSidebar, BlockEditor, etc.)
3. The page is primarily composition + state management
4. Splitting the page into more sub-components would mean prop-drilling the mode state and cross-mode navigation callbacks, which is worse

If it exceeds ~2000 LOC, consider extracting the Notes mode and Graph mode bodies into `NotesPanel` and `GraphPanel` components that receive shared state via props.

---

## File Change Summary

| Action | File |
|--------|------|
| Create | `src/components/graph/graph-canvas.tsx` |
| Create | `src/components/graph/graph-controls.tsx` |
| Create | `src/components/graph/graph-inspector.tsx` |
| Create | `src/components/graph/graph-sidebar.tsx` |
| Create | `src/components/knowledge/segmented-toggle.tsx` |
| Create | `src/pages/knowledge.tsx` |
| Modify | `src/main.tsx` |
| Modify | `src/components/layout/top-nav.tsx` |
| Modify | `src/components/command-palette/command-palette.tsx` |
| Delete | `src/pages/notes.tsx` (after audit) |
| Delete | `src/pages/graph.tsx` (after audit) |

## Verification Checklist

1. ☐ Navigate to `/knowledge` → Notes mode by default
2. ☐ Segmented toggle switches between Notes/Graph (instant, no flash)
3. ☐ Notes mode: NotesSidebar with 4 views (pages, journals, books, concepts)
4. ☐ Notes mode: Search with debounced hybrid backend search
5. ☐ Notes mode: BlockEditor renders blocks, handles editing
6. ☐ Notes mode: `[[wikilinks]]` render with accent color, clickable
7. ☐ Notes mode: PageLinkPopup autocomplete on `[[` input
8. ☐ Notes mode: Tab bubbles at bottom, click to switch, X to close, + to create
9. ☐ Notes mode: Zen mode hides sidebar
10. ☐ Notes mode: Read/write toggle
11. ☐ Notes mode: Title inline edit
12. ☐ Notes mode: Landing state with action buttons and recent pages
13. ☐ Notes mode: Table of Contents panel (Ctrl+Shift+T)
14. ☐ Notes mode: AI Chat panel
15. ☐ Notes mode: Version history (DiffSheet)
16. ☐ Notes mode: Tools drawer (8 buttons)
17. ☐ Notes mode: Journal badge on active page
18. ☐ Notes mode: Context menus (rename, favorite, pin, move to notebook, export, delete)
19. ☐ Notes mode: Drag-and-drop pages to notebooks
20. ☐ Graph mode: Canvas renders nodes + edges with viewport culling
21. ☐ Graph mode: Node click → select + inspector/split editor
22. ☐ Graph mode: Node drag → physics pin/move/unpin
23. ☐ Graph mode: Camera pan (drag) + zoom (wheel)
24. ☐ Graph mode: Zoom to fit
25. ☐ Graph mode: Search sidebar with node list (80 max)
26. ☐ Graph mode: Type filter pills with counts
27. ☐ Graph mode: Physics start/stop/rebuild
28. ☐ Graph mode: FPS mode (F key, pointer lock, WASD, HUD)
29. ☐ Graph mode: Performance tier adaptation (edge/label LOD)
30. ☐ Graph mode: Click Note node → split editor slides in with BlockEditor
31. ☐ Graph mode: Split editor wikilink navigation works
32. ☐ Graph mode: Double-click Note node → switch to Notes mode
33. ☐ Cross-mode: Knowledge Graph tool button → switch to Graph mode
34. ☐ Cross-mode: Inspector "Open" → switch to Notes mode
35. ☐ Navigation: `/knowledge` route works
36. ☐ Navigation: `/notes` and `/graph` redirect to `/knowledge`
37. ☐ Navigation: Top nav shows single "Knowledge" bubble
38. ☐ Navigation: Command palette updated
39. ☐ Physics pauses in Notes mode, resumes in Graph mode
40. ☐ Old `notes.tsx` and `graph.tsx` deleted
