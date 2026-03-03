# Memory

## User Engineering Philosophy
- Direct communication — no fluff, get to the point
- Zero-copy patterns — avoid unnecessary data duplication, prefer references and views
- Core principles: simplicity, performance, native patterns (AppKit/SwiftUI as Apple intended)
- See [epistemos.md](epistemos.md) for project-specific patterns

## Epistemos Project
- Location: `/Users/jojo/epistemos/`
- Lucid v3 source: `/Users/jojo/lucid v3/lucid v3/lucid v3/`
- macOS-only SwiftUI + SwiftData + Rust FFI (graph engine)
- Process name for logs: `Epistemos` (or `pistemos` for pgrep)
- Build: `xcodebuild -scheme "Epistemos" -destination "platform=macOS" build`
- Tests: 1403 tests in 194 suites (pre-existing failure in "Pipeline handles thinking tags as deliberation")
- Audit: 46 items reviewed across waves 1-13, 17. See `docs/audit-progress.md`
