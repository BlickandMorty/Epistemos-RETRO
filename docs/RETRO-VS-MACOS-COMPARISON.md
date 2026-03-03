# Epistemos Retro vs macOS Opulent Edition — Comprehensive Comparison

**Date:** 2026-03-03  
**Retro Status:** Post-P0, P1 partially complete, 368 tests passing  
**macOS Status:** Production-ready, 1403 tests passing, Apple Design Award quality

---

## Executive Summary

| Metric | macOS Opulent | Retro Edition | Gap |
|--------|---------------|---------------|-----|
| Lines of Code (Swift/Rust) | ~45,000 | ~12,000 | +33,000 to port |
| Test Count | 1,403 | 368 | -1,035 tests |
| UI Components | 85+ SwiftUI views | 81 React components | Near parity |
| Backend Commands | N/A (in-process) | 67 Tauri commands | Comparable |
| Graph Rendering | Metal + Rust FFI | Bevy + Rapier3D | Different, not inferior |
| Unique Features | Multi-window, Shortcuts, Spotlight | FPS Mode, 3-tier routing, 6 themes | Each has exclusive features |

---

## 🌟 Where Retro is AHEAD of macOS (Gentle Upgrades)

These are legitimate improvements that macOS doesn't have:

### 1. **FPS Exploration Mode** ⭐ UNIQUE TO RETRO
- **File:** `crates/ui-physics/src/fps_mode.rs`
- **What:** First-person exploration of the knowledge graph as a navigable universe
- **Features:**
  - N-body gravitational forces from graph nodes
  - Newtonian physics with thruster controls (WASD + mouse)
  - Proximity detection for node inspection
  - Stabilization modes (aiming / full)
  - World scaling (100-1000x for solar system feel)
- **Why macOS doesn't have it:** Different UX philosophy — macOS focuses on holographic overlay, Retro embraces gamification
- **Effort to port to mac:** High — would need SceneKit or Unity integration

### 2. **Three-Tier Triage Routing** ⭐ SUPERIOR TO MAC
- **File:** `crates/engine/src/triage.rs`
- **macOS has:** Binary routing (Apple Intelligence vs Cloud)
- **Retro has:** NPU (Foundry Local) → GPU (Ollama) → Cloud fallback cascade
- **Advantages:**
  - NPU tier for sub-100ms responses (grammar, summaries)
  - GPU tier for medium complexity (~500ms)
  - Cloud tier for deep analysis
  - Hardware-optimized for Dell XPS 16 (Intel NPU + RTX 4060)
- **Refusal detection:** 25+ patterns with truncation detection
- **macOS gap:** No GPU tier — Apple Silicon is either Neural Engine or CPU

### 3. **Six Complete Themes with Animated Wallpapers**
- **Files:** `src/styles/theme.css`, animated wallpaper components
- **Themes:** Retro Amber, Cyberpunk, Midnight, Solarized, Nord, Light
- **macOS has:** System appearance following (light/dark/auto)
- **Retro advantages:**
  - StarField particle system (Canvas-based)
  - SunnyWallpaper (animated clouds)
  - SunsetWallpaper (parallax mountains)
  - Pixel fonts (8 typefaces)
  - Theme-aware glass morphism
- **Note:** macOS 26 has liquid glass, but Retro has more personality

### 4. **Character-Based AI Personalities**
- **File:** `src/components/notes/note-ai-chat.tsx`
- **Izmi (dark theme):** Playful robot with jokes
- **Sunny (light theme):** Warm, casual assistant
- **macOS has:** Generic AI assistant
- **Retro advantage:** Personality-driven UX with themed greetings

### 5. **GreetingTypewriter Animation**
- **File:** `src/components/notes/note-ai-chat.tsx` (lines 137-219)
- **Features:**
  - Per-character reveal (35ms random delay)
  - Hesitation pauses at random intervals
  - Punctuation pauses (150-300ms)
  - Cursor blink during typing
  - Character-specific lines (Izmi: 3 lines, Sunny: 2 lines)
- **macOS equivalent:** LiquidGreeting.swift (simpler, no typewriter)

### 6. **Foundry Local Integration (Windows NPU)**
- **File:** `crates/engine/src/llm/foundry.rs`
- **What:** Intel NPU inference via Foundry Local
- **macOS equivalent:** Apple Intelligence (private, no API for developers)
- **Retro advantage:** Direct NPU control, model selection, visible routing

### 7. **Block-Based Note Editor with Transactions**
- **File:** `src/components/notes/block-editor/`
- **Features:**
  - Transaction system for undo/redo
  - Block-level operations (not just text)
  - AI operations as first-class transactions
- **macOS:** NSTextStorage-based (great, but different)

---

## 📊 Complete Gap Analysis: What Retro Needs to Reach macOS Parity

### TIER 0: CRITICAL FOUNDATION (Incomplete)

| ID | Feature | macOS Status | Retro Status | Gap Severity |
|----|---------|--------------|--------------|--------------|
| T0.1 | Multi-window note editing | ✅ Full (90KB NoteWindowManager) | ❌ Single window, tabs only | **HIGH** |
| T0.2 | Native text editor (NSTextView) | ✅ Full (65KB ProseEditor) | ⚠️ React-based block editor | **MEDIUM** |
| T0.3 | Metal graph rendering | ✅ Full (50KB MetalGraphView) | ⚠️ Bevy placeholder | **HIGH** |
| T0.4 | Siri Shortcuts integration | ✅ Full (Intents/) | ❌ Not possible on Windows | **N/A** |
| T0.5 | Spotlight search integration | ✅ Full | ❌ Not possible on Windows | **N/A** |

### TIER 1: CORE FEATURES (Major Gaps)

#### 1.1 **Command Palette System** 🔴 CRITICAL GAP
- **macOS:** `CommandPaletteOverlay.swift` (73KB, 1,709 lines)
- **Features:**
  - System-wide shortcut (Cmd+K)
  - Fuzzy search across all notes, chats, commands
  - Recent items, favorites
  - Action palette (create note, start chat, etc.)
  - Provider dropdown switching
  - Quick navigation
- **Retro:** Basic search only
- **Effort to implement:** 2-3 days
- **User impact:** HIGH — this is the primary navigation pattern

#### 1.2 **Note Chat Inline Integration** 🟡 PARTIAL GAP
- **macOS:** `NoteChatState.swift` — AI text streams directly into NSTextStorage below `---` divider
- **Features:**
  - Divider-based zone protection
  - Accept/Discard with inline text manipulation
  - No separate panel — text becomes part of note
  - 60ms token buffering
  - Mode selection (auto/cloudOnly/provider)
- **Retro:** `NoteAIChat.tsx` — Floating bubble panel
- **Gap:** Different UX paradigm — Retro uses overlay, macOS uses inline
- **User impact:** MEDIUM — both work, different preferences

#### 1.3 **Advanced Query System** 🔴 MAJOR GAP
- **macOS files:**
  - `QueryParser.swift` (188 lines)
  - `QueryAST.swift` (Query AST nodes)
  - `QueryCompiler.swift` (236 lines)
  - `QueryRuntime.swift` (1,155 lines!)
  - `ReactiveQuery.swift` (215 lines)
  - `StructuredQueryParser.swift` (480 lines)
- **Features:**
  - Structured query language for notes
  - Filter combinations (AND/OR/NOT)
  - Date range queries
  - Tag-based queries
  - Full-text with ranking
  - Saved queries
  - Reactive updates
- **Retro:** Basic FTS5 + FST search only
- **Effort to implement:** 3-4 days
- **User impact:** HIGH — power user feature

#### 1.4 **Graph Hologram Overlay** 🟡 MISSING
- **macOS:** `HologramOverlay.swift` (37KB), `HologramController.swift`
- **Features:**
  - Floating graph view over other apps
  - Holographic visual effects
  - Node inspector overlay
  - Search sidebar in overlay
  - Relationship browser
- **Retro:** Full-screen graph page only
- **Effort:** 2 days
- **User impact:** LOW — nice-to-have

#### 1.5 **Graph Force Settings** 🟡 MISSING
- **macOS:** `GraphForceSettings.swift` (20KB)
- **Features:**
  - Real-time physics tuning
  - Force parameters UI
  - Preset configurations
  - Live preview
- **Retro:** Fixed physics parameters
- **Effort:** 1 day
- **User impact:** LOW

### TIER 2: NOTE EDITOR FEATURES

#### 2.1 **Block Property Sheets** 🟡 MISSING
- **macOS:** `BlockPropertySheet.swift`
- **Features:**
  - Per-block metadata editing
  - Property inheritance
  - Custom attributes
- **Retro:** No block properties
- **Effort:** 1-2 days

#### 2.2 **Block Ref Autocomplete** 🟡 MISSING
- **macOS:** `BlockRefAutocomplete.swift` (10KB)
- **Features:**
  - `((` triggers block reference search
  - Fuzzy matching on block content
  - Preview on hover
- **Retro:** No block references
- **Effort:** 1 day

#### 2.3 **Transclusion System** 🔴 MISSING
- **macOS:**
  - `EditableTransclusionView.swift`
  - `TransclusionOverlayManager.swift`
  - `TransclusionOverlayView.swift`
- **Features:**
  - Embed blocks from other notes
  - Live sync (edit source → updates everywhere)
  - Transclusion overlays
- **Retro:** No transclusion
- **Effort:** 3-4 days
- **User impact:** HIGH — core knowledge management feature

#### 2.4 **Table of Contents** 🟡 MISSING
- **macOS:** `NoteTableOfContents.swift`
- **Features:**
  - Auto-generated from headers
  - Click to navigate
  - Collapsible sections
- **Retro:** No TOC
- **Effort:** 4 hours

#### 2.5 **Version Timeline** 🔴 MISSING
- **macOS:** `VersionTimeline.swift` (21KB)
- **Features:**
  - Visual version history
  - Diff viewing
  - Restore to version
  - Branch visualization
- **Retro:** No versioning UI
- **Effort:** 2 days
- **User impact:** MEDIUM

#### 2.6 **Diff Sheet for Conflicts** 🔴 MISSING
- **macOS:** `DiffSheetView.swift` (30KB), `LineDiff.swift`
- **Features:**
  - Side-by-side diff
  - Line-by-line comparison
  - Accept/reject changes
  - Vault sync conflict resolution
- **Retro:** No diff UI
- **Effort:** 2 days
- **User impact:** HIGH — essential for vault sync

### TIER 3: CHAT FEATURES

#### 3.1 **Thinking Accordion** 🟡 MISSING
- **macOS:** `ThinkingAccordion.swift`
- **Features:**
  - Collapsible `<thinking>` blocks
  - Deliberation visualization
  - Per-step expansion
- **Retro:** Raw thinking text in stream
- **Effort:** 4 hours

#### 3.2 **Concept Mini-Map** 🟡 MISSING
- **macOS:** `ConceptMiniMap.swift`
- **Features:**
  - Visual concept map from `[CONCEPTS: ...]`
  - Related concept navigation
  - Graph connection preview
- **Retro:** Concepts shown as text only
- **Effort:** 1 day

#### 3.3 **Tagged Markdown Text View** 🟡 MISSING
- **macOS:** `TaggedMarkdownTextView.swift` (21KB)
- **Features:**
  - Rich markdown rendering
  - Custom tag highlighting
  - Interactive citations
  - Evidence grade badges
- **Retro:** Basic markdown
- **Effort:** 1-2 days

#### 3.4 **Pipeline Progress Popover** 🟢 HAS IT
- **macOS:** `PipelineProgressPopover.swift`
- **Retro:** `PipelineStages` component
- **Status:** ✅ Parity achieved

### TIER 4: VAULT & SYNC

#### 4.1 **Vault Changes Panel** 🟡 MISSING
- **macOS:** `VaultChangesPanel.swift`
- **Features:**
  - Visual diff of pending changes
  - Selective sync
  - Change categorization
- **Retro:** Basic sync only
- **Effort:** 1 day

#### 4.2 **Vault Organizer View** 🟡 MISSING
- **macOS:** `VaultOrganizerView.swift` (21KB)
- **Features:**
  - Folder-based vault organization
  - Drag-and-drop filing
  - Collection registry
- **Retro:** Basic folder tree
- **Effort:** 1-2 days

### TIER 5: RESEARCH MODE

#### 5.1 **Full Research Service** 🟡 PARTIAL
- **macOS:** `ResearchService.swift` (25KB)
- **Features:**
  - Novelty check (up to 3 search rounds)
  - Paper review with S2 API
  - Citation search (rate-limited, 200ms delay)
  - Idea generation
  - **NOT a state machine** — toolkit of independent operations
- **Retro:** `research.rs` — Basic stage progression only
- **Gap:** No S2 integration, no novelty check, no paper review
- **Effort:** 3-4 days
- **User impact:** MEDIUM

### TIER 6: PLATFORM-SPECIFIC (Can't Port)

| Feature | macOS | Windows Equivalent | Status |
|---------|-------|-------------------|--------|
| Siri Shortcuts | ✅ | ❌ None | N/A |
| Spotlight Indexing | ✅ | Windows Search (limited) | N/A |
| Apple Intelligence | ✅ | Foundry Local (Retro has this) | ✅ Retro wins |
| Keychain | ✅ | Windows Credential Manager | ⚠️ Not implemented |
| NSStatusBar | ✅ | System tray via Tauri | ⚠️ Not implemented |

---

## 🔧 Implementation Priority for Retro

### Phase A: Critical User-Facing (1-2 weeks)
1. **Command Palette** — Primary navigation
2. **Diff Sheet** — Essential for vault sync
3. **Transclusion** — Core knowledge management
4. **Version Timeline** — Expected by users

### Phase B: Editor Polish (1 week)
5. **Block Ref Autocomplete** — Developer/power user feature
6. **Table of Contents** — Standard feature
7. **Block Property Sheets** — Nice-to-have

### Phase C: Chat Polish (3-4 days)
8. **Thinking Accordion** — Better deliberation UX
9. **Concept Mini-Map** — Visual concepts
10. **Tagged Markdown** — Richer messages

### Phase D: Research (3-4 days)
11. **Semantic Scholar integration**
12. **Novelty check**
13. **Paper review**

### Phase E: Platform (2-3 days)
14. **System tray integration**
15. **Windows Credential Manager**

---

## 📈 Effort Estimates

| Category | Lines of Code (macOS) | Estimated Effort | Priority |
|----------|----------------------|------------------|----------|
| Command Palette | 1,709 | 2-3 days | P0 |
| Query System | 2,500+ | 3-4 days | P1 |
| Transclusion | 1,200 | 3-4 days | P1 |
| Diff/Versioning | 1,500 | 2-3 days | P1 |
| Editor Polish | 2,000 | 3-4 days | P2 |
| Chat Polish | 1,500 | 2-3 days | P2 |
| Research | 2,500 | 3-4 days | P2 |
| Graph Polish | 1,500 | 2-3 days | P3 |
| **Total** | **~14,000** | **~3-4 weeks** | — |

---

## ✅ What Retro Does Better (Summary)

1. **FPS Exploration Mode** — Unique, gamified graph navigation
2. **3-Tier Routing** — More granular than macOS binary routing
3. **6 Themes** — More personality than macOS system appearance
4. **Character AI** — Izmi/Sunny personalities
5. **Cross-platform** — Windows, Linux (future), Web (future)
6. **NPU access** — Intel NPU vs Apple Neural Engine (locked down)

---

## 🎯 Recommendations

### For Retro to Achieve Feature Parity:

1. **Implement Command Palette first** — This is the biggest UX gap
2. **Add transclusion** — Core to the knowledge graph philosophy
3. **Build diff/version UI** — Essential for vault confidence
4. **Port query system** — Enables power users
5. **Keep FPS mode** — Market this as a Retro exclusive

### Marketing Angles:

- **Retro:** "Explore your knowledge graph like a universe" (FPS mode)
- **macOS:** "Native, integrated, Apple Design Award quality"
- **Both:** "Same brain, different bodies"

---

*Report generated by deep codebase analysis of both repositories.*
