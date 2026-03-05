# Epistemos RETRO — Handoff & Current State

Last updated: 2026-03-04

## Quick Start (Windows)

```bash
cd Epistemos-RETRO
npm install
npm run tauri dev    # Full app (Tauri + Rust + React)
```

## Quick Start (macOS — frontend preview only)

```bash
cd ~/Epistemos-RETRO
npm run dev          # React UI only at localhost:5173, no backend
cargo check          # Verify Rust compiles
```

## What Was Just Built (2026-03-04 Session)

### Unified Knowledge Page
Fused the separate Notes and Graph pages into one page at `/knowledge`.

**Key files created/modified:**
- `src/pages/knowledge.tsx` (1060 lines) — the unified page
- `src/components/knowledge/segmented-toggle.tsx` — Notes|Graph toggle
- `src/components/graph/graph-canvas.tsx` — extracted Canvas 2D renderer
- `src/components/graph/graph-controls.tsx` — bottom control bar
- `src/components/graph/graph-inspector.tsx` — right inspector panel
- `src/components/graph/graph-sidebar.tsx` — left search sidebar

**Routing changes:**
- `/knowledge` is the main route
- `/notes` and `/graph` redirect to `/knowledge`
- Top nav shows single "Knowledge" item
- Command palette: "Go to Knowledge" (G K)
- All `navigate('/notes')` and `navigate('/graph')` calls updated

**Features verified (40-point audit, all pass):**
- Notes mode: sidebar, block editor, TOC, AI chat, diff sheet, bottom tabs, tools drawer, zen mode, landing state
- Graph mode: canvas, physics, FPS mode, search, inspector, controls, type filters
- Cross-mode: split editor, node selection from Notes, wikilink sync
- Physics: pauses in Notes mode, resumes in Graph mode

### Decision: Fluent Edition Cancelled
The WinUI 3 + C# Fluent Edition was cancelled. All effort is now on RETRO (Tauri + React + Rust).

## Phase Progress

| Phase | What | Status |
|-------|------|--------|
| 1 | Scaffold + UI | ~90% done |
| 2 | Storage (SQLite CRUD) | ~30% — crate exists, partial |
| 3 | Tauri Bridge (stubs→real) | ~20% — some commands wired |
| 4 | LLM + Pipeline | ~5% — skeleton only |
| 5 | Graph Physics (Bevy/wgpu/Rapier3D) | 0% — Canvas 2D placeholder |
| 6 | Entity Extraction | 0% |
| 7 | SOAR + Full Pipeline | 0% |
| 8 | Search + Sync + Polish | ~15% — block parser exists |

Full plan: `docs/plans/2026-02-28-retro-edition-plan.md`
Design: `docs/plans/2026-02-28-retro-edition-design.md`

## What to Work On Next

**Recommended order:**
1. Finish Phase 2 (storage CRUD + tests) — pure Rust, no UI
2. Finish Phase 3 (wire real backend) — notes persist for real
3. Phase 5 (Bevy + wgpu graph) — the "higher quality than macOS" renderer
4. Phase 4 (LLM providers + streaming)

## Known Issues

- Old `src/pages/notes.tsx` and `src/pages/graph.tsx` still on disk (unused, routes redirect) — safe to delete
- 3 cargo warnings in engine crate (unused imports)
- Graph is Canvas 2D placeholder — no shading, no 3D, no Bevy/wgpu yet
- FPS mode skeleton exists but needs real Bevy physics backend
- `npm run dev` on macOS shows UI but nothing works (no Tauri backend)

## Architecture Reference

```
src/
├── pages/
│   ├── knowledge.tsx    ← unified Notes+Graph (main page)
│   ├── chat.tsx
│   ├── library.tsx
│   ├── settings.tsx
│   └── landing.tsx
├── components/
│   ├── knowledge/       ← segmented toggle
│   ├── graph/           ← canvas, controls, inspector, sidebar
│   ├── notes/           ← sidebar, block-editor, TOC, diff, AI chat
│   ├── chat/            ← chat UI components
│   └── layout/          ← app-shell, top-nav, page-shell
├── lib/
│   ├── store/           ← Zustand (9 slices)
│   ├── bindings.ts      ← tauri-specta generated
│   └── perf.ts          ← performance tier detection
crates/
├── storage/             ← SQLite + note bodies
├── engine/              ← LLM providers, pipeline, signals
├── graph/               ← graph store, builder, extractor
├── sync/                ← vault sync, block parser
├── embeddings/          ← ONNX embeddings
├── graph-render/        ← Bevy + wgpu (future)
└── ui-physics/          ← WASM spring solver (future)
```
