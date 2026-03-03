# Epistemos Patterns

## Swift 6 / Concurrency
- `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — file-scope types inherit MainActor
- Logger: file-scope `let` is MainActor-isolated. For @ModelActor, store as `let` inside the actor
- Use `nonisolated` on Codable structs used from nonisolated contexts
- Avoid Task.detached calling back to @MainActor (deadlock risk)

## Performance
- @Observable in large lists: isolate to child View structs to avoid 1000+ tracker registrations
- Value types break tracking (good): convert @Model to plain Equatable structs for row views
- No body search in @Query — use trigram/FTS5 index

## Vault Sync
- VaultSyncService: Apple Notes hybrid — SwiftData is source of truth, .md files are import/export
- VaultIndexActor: @ModelActor for background import (own ModelContext)
- File encoding: UTF-8 primary, Latin-1 fallback (added 2026-03-01)
- Import diagnostic: logs disk count vs DB count mismatch

## Architecture
- Fewer files with clear responsibilities over many tiny files
- No wrapper types unless they solve a measured performance problem
- No abstractions until the third time you need one
- Build after every meaningful change — don't accumulate errors
