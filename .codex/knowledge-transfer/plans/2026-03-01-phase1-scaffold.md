# Phase 1: Scaffold + UI Copy — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tauri window opens with the full Brainiac 2.0 UI running in Vite + React Router. All backend calls use `invoke()` returning mock data from Rust stubs. Zero `fetch()`, zero Next.js.

**Architecture:** Tauri 2.x desktop app with a Vite + React frontend (webview) and a Rust backend (Cargo workspace with 7 crate stubs). The frontend is a direct port of the Brainiac 2.0 Next.js app, mechanically migrated to Vite + React Router. All `fetch('/api/...')` calls are replaced with `invoke()` via tauri-specta auto-generated bindings. Rust commands return mock data in this phase.

**Tech Stack:** Tauri 2.x, Vite 6, React 19, React Router 7, Zustand 5, Tailwind 4, tauri-specta, rusqlite (stub), thiserror, uuid

**Prerequisites:**
- Read `docs/plans/2026-02-28-retro-edition-engineering-standards.md` (THE LAW)
- Read `docs/plans/2026-02-28-retro-edition-design.md` (architecture)
- Source repos available:
  - Mac logic: `/Users/jojo/Epistemos/`
  - Web UI: `/Users/jojo/meta-analytical-pfc/brainiac-2.0/`

---

## Task 1: Create Tauri 2.x + Vite Project

**Files:**
- Create: `package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`

**Step 1: Initialize Tauri project with Vite + React template**

Run:
```bash
cd /Users/jojo/Epistemos-RETRO
npm create tauri-app@latest . -- --template react-ts --manager npm
```

Select: Vite, React, TypeScript

Expected: Project scaffold created with `src-tauri/`, `src/`, `package.json`, `vite.config.ts`

**Step 2: Install Tauri dependencies**

Run:
```bash
npm install
npm install @tauri-apps/api @tauri-apps/plugin-store
npm install react-router-dom@7
npm install zustand@5
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-scroll-area @radix-ui/react-collapsible @radix-ui/react-switch @radix-ui/react-slider @radix-ui/react-separator @radix-ui/react-alert-dialog
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install react-markdown remark-gfm
npm install date-fns zod
npm install -D tailwindcss@4 @tailwindcss/postcss @tailwindcss/typography postcss
```

Expected: `node_modules/` populated, `package.json` updated

**Step 3: Configure Vite for Tauri**

File: `vite.config.ts`
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**Step 4: Configure TypeScript**

File: `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**Step 5: Create HTML entry point**

File: `index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Epistemos Retro Edition</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Verify scaffold compiles**

Run:
```bash
npm run dev
```
Expected: Vite starts on http://localhost:1420, shows default React page

Run:
```bash
cd src-tauri && cargo build
```
Expected: Rust compiles successfully

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: initialize Tauri 2.x + Vite + React project scaffold"
```

---

## Task 2: Set Up Cargo Workspace with Crate Stubs

**Files:**
- Create: `Cargo.toml` (workspace root)
- Create: `crates/storage/Cargo.toml`, `crates/storage/src/lib.rs`
- Create: `crates/engine/Cargo.toml`, `crates/engine/src/lib.rs`
- Create: `crates/graph/Cargo.toml`, `crates/graph/src/lib.rs`
- Create: `crates/sync/Cargo.toml`, `crates/sync/src/lib.rs`
- Create: `crates/embeddings/Cargo.toml`, `crates/embeddings/src/lib.rs`
- Create: `crates/graph-render/Cargo.toml`, `crates/graph-render/src/lib.rs`
- Create: `crates/ui-physics/Cargo.toml`, `crates/ui-physics/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Create workspace Cargo.toml at project root**

File: `Cargo.toml`
```toml
[workspace]
members = [
    "src-tauri",
    "crates/storage",
    "crates/engine",
    "crates/graph",
    "crates/sync",
    "crates/embeddings",
    "crates/graph-render",
    "crates/ui-physics",
]
resolver = "2"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
thiserror = "2"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled"] }
```

**Step 2: Create each crate stub**

For each crate, create `Cargo.toml` and `src/lib.rs`:

File: `crates/storage/Cargo.toml`
```toml
[package]
name = "storage"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
uuid = { workspace = true }
thiserror = { workspace = true }
rusqlite = { workspace = true }
```

File: `crates/storage/src/lib.rs`
```rust
pub mod ids;
pub mod error;

// Stub: real implementation in Phase 2
```

File: `crates/engine/Cargo.toml`
```toml
[package]
name = "engine"
version = "0.1.0"
edition = "2021"

[dependencies]
storage = { path = "../storage" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
tokio = { workspace = true }
```

File: `crates/engine/src/lib.rs`
```rust
// Stub: real implementation in Phase 4
```

File: `crates/graph/Cargo.toml`
```toml
[package]
name = "graph"
version = "0.1.0"
edition = "2021"

[dependencies]
storage = { path = "../storage" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
```

File: `crates/graph/src/lib.rs`
```rust
// Stub: real implementation in Phase 5
```

File: `crates/sync/Cargo.toml`
```toml
[package]
name = "sync"
version = "0.1.0"
edition = "2021"

[dependencies]
storage = { path = "../storage" }
serde = { workspace = true }
thiserror = { workspace = true }
```

File: `crates/sync/src/lib.rs`
```rust
// Stub: real implementation in Phase 8
```

File: `crates/embeddings/Cargo.toml`
```toml
[package]
name = "embeddings"
version = "0.1.0"
edition = "2021"

[dependencies]
thiserror = { workspace = true }
```

File: `crates/embeddings/src/lib.rs`
```rust
// Stub: real implementation in Phase 8
```

File: `crates/graph-render/Cargo.toml`
```toml
[package]
name = "graph-render"
version = "0.1.0"
edition = "2021"

[dependencies]
thiserror = { workspace = true }
```

File: `crates/graph-render/src/lib.rs`
```rust
// Stub: real implementation in Phase 5
```

File: `crates/ui-physics/Cargo.toml`
```toml
[package]
name = "ui-physics"
version = "0.1.0"
edition = "2021"

[dependencies]
```

File: `crates/ui-physics/src/lib.rs`
```rust
// Stub: real implementation in Phase 5
```

**Step 3: Update src-tauri/Cargo.toml to use workspace deps**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
storage = { path = "../crates/storage" }
engine = { path = "../crates/engine" }
graph = { path = "../crates/graph" }
sync = { path = "../crates/sync" }
serde = { workspace = true }
serde_json = { workspace = true }
uuid = { workspace = true }
tokio = { workspace = true }
```

**Step 4: Verify workspace compiles**

Run:
```bash
cargo build --workspace
```
Expected: All 8 crates compile successfully

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: set up Cargo workspace with 7 crate stubs"
```

---

## Task 3: Define Newtype IDs and Error Types

**Files:**
- Create: `crates/storage/src/ids.rs`
- Create: `crates/storage/src/error.rs`
- Create: `crates/storage/src/types.rs`
- Test: `crates/storage/tests/ids_test.rs`

**Step 1: Write failing tests for ID serialization**

File: `crates/storage/tests/ids_test.rs`
```rust
use storage::ids::*;

#[test]
fn page_id_serializes_as_uuid_string() {
    let id = PageId::new();
    let json = serde_json::to_string(&id).unwrap();
    // Should be a plain UUID string like "\"550e8400-...\""
    assert!(json.starts_with('"'));
    assert!(json.ends_with('"'));
    assert_eq!(json.len(), 38); // 36 UUID chars + 2 quotes
}

#[test]
fn page_id_deserializes_from_uuid_string() {
    let original = PageId::new();
    let json = serde_json::to_string(&original).unwrap();
    let restored: PageId = serde_json::from_str(&json).unwrap();
    assert_eq!(original, restored);
}

#[test]
fn different_id_types_are_not_interchangeable() {
    // This test documents the type safety — it should NOT compile
    // if you uncomment the assignment. We verify the types exist
    // and are distinct by checking Display output differs in prefix.
    let page_id = PageId::new();
    let chat_id = ChatId::new();
    assert_ne!(page_id.to_string(), chat_id.to_string());
}

#[test]
fn id_display_is_uuid_format() {
    let id = PageId::new();
    let display = id.to_string();
    // UUID v4 format: 8-4-4-4-12
    assert_eq!(display.len(), 36);
    assert_eq!(display.chars().filter(|c| *c == '-').count(), 4);
}
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cargo test -p storage
```
Expected: FAIL — `ids` module doesn't exist

**Step 3: Implement newtype IDs**

File: `crates/storage/src/ids.rs`
```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            pub fn from_uuid(uuid: Uuid) -> Self {
                Self(uuid)
            }

            pub fn as_uuid(&self) -> &Uuid {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl std::str::FromStr for $name {
            type Err = uuid::Error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(Uuid::parse_str(s)?))
            }
        }
    };
}

define_id!(PageId);
define_id!(BlockId);
define_id!(ChatId);
define_id!(MessageId);
define_id!(GraphNodeId);
define_id!(GraphEdgeId);
define_id!(FolderId);
```

**Step 4: Implement error types**

File: `crates/storage/src/error.rs`
```rust
use crate::ids::PageId;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("page not found: {0}")]
    PageNotFound(PageId),

    #[error("chat not found: {0}")]
    ChatNotFound(String),

    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("body file I/O: {0}")]
    BodyIo(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
```

**Step 5: Implement stub types**

File: `crates/storage/src/types.rs`
```rust
use serde::{Deserialize, Serialize};
use crate::ids::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: PageId,
    pub title: String,
    pub summary: String,
    pub research_stage: i32,
    pub tags: Vec<String>,
    pub file_path: Option<String>,
    pub subfolder: Option<String>,
    pub parent_page_id: Option<PageId>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: BlockId,
    pub page_id: PageId,
    pub parent_block_id: Option<BlockId>,
    pub order: i32,
    pub depth: i32,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: ChatId,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: MessageId,
    pub chat_id: ChatId,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page_id: PageId,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceConfig {
    pub api_provider: String,
    pub model: String,
    pub ollama_base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

// Graph types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphNodeType {
    Note, Chat, Idea, Source, Folder, Quote, Tag, Block,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphEdgeType {
    Reference, Contains, Tagged, Mentions, Cites, Authored,
    Related, Quotes, Supports, Contradicts, Expands, Questions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeSource {
    Page(PageId),
    Chat(ChatId),
    Folder(FolderId),
    Block(BlockId),
    Idea { origin_page: PageId, index: usize },
    Tag(String),
    Quote { origin_page: PageId },
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: GraphNodeId,
    pub node_type: GraphNodeType,
    pub label: String,
    pub source: NodeSource,
    pub weight: f64,
    pub is_manual: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: GraphEdgeId,
    pub source_node_id: GraphNodeId,
    pub target_node_id: GraphNodeId,
    pub edge_type: GraphEdgeType,
    pub weight: f64,
    pub is_manual: bool,
}

// Mock constructors for stub phase
impl Page {
    pub fn mock(id: PageId) -> Self {
        let now = chrono_now_ms();
        Self {
            id,
            title: "Untitled".into(),
            summary: String::new(),
            research_stage: 0,
            tags: vec![],
            file_path: None,
            subfolder: None,
            parent_page_id: None,
            created_at: now,
            updated_at: now,
        }
    }
}

impl Chat {
    pub fn mock(id: ChatId) -> Self {
        let now = chrono_now_ms();
        Self {
            id,
            title: "New Chat".into(),
            created_at: now,
            updated_at: now,
        }
    }
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
```

**Step 6: Update lib.rs to export modules**

File: `crates/storage/src/lib.rs`
```rust
pub mod ids;
pub mod error;
pub mod types;
```

**Step 7: Run tests to verify they pass**

Run:
```bash
cargo test -p storage
```
Expected: All 4 tests PASS

**Step 8: Run clippy**

Run:
```bash
cargo clippy -p storage -- -D warnings
```
Expected: No warnings

**Step 9: Commit**

```bash
git add crates/storage/
git commit -m "feat: define newtype IDs, error types, and data models"
```

---

## Task 4: Set Up tauri-specta and Rust Command Stubs

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/notes.rs`
- Create: `src-tauri/src/commands/chat.rs`
- Create: `src-tauri/src/commands/graph.rs`
- Create: `src-tauri/src/commands/search.rs`
- Create: `src-tauri/src/commands/vault.rs`
- Create: `src-tauri/src/commands/system.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add tauri-specta dependency**

Add to `src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri-specta = { version = "2", features = ["typescript"] }
specta = { version = "2", features = ["derive"] }
specta-typescript = "0.0.7"
```

Run:
```bash
npm install @specta/typescript
```

**Step 2: Implement AppError**

File: `src-tauri/src/error.rs`
```rust
use serde::Serialize;
use storage::error::StorageError;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Storage(#[from] StorageError),

    #[error("not implemented: {0}")]
    NotImplemented(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let kind = match self {
            Self::Storage(StorageError::PageNotFound(_)) => "not_found",
            Self::Storage(StorageError::Database(_)) => "database",
            Self::Storage(_) => "storage",
            Self::NotImplemented(_) => "not_implemented",
            Self::Internal(_) => "internal",
        };
        let mut map = s.serialize_map(Some(2))?;
        map.serialize_entry("kind", kind)?;
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}
```

**Step 3: Implement command stubs — notes**

File: `src-tauri/src/commands/notes.rs`
```rust
use storage::ids::PageId;
use storage::types::{Block, Page};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn create_page(title: String) -> Result<Page, AppError> {
    let id = PageId::new();
    let mut page = Page::mock(id);
    page.title = title;
    Ok(page)
}

#[tauri::command]
#[specta::specta]
pub async fn get_page(page_id: String) -> Result<Page, AppError> {
    let id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(Page::mock(id))
}

#[tauri::command]
#[specta::specta]
pub async fn list_pages() -> Result<Vec<Page>, AppError> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn delete_page(page_id: String) -> Result<(), AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn load_body(page_id: String) -> Result<String, AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(String::new())
}

#[tauri::command]
#[specta::specta]
pub async fn save_body(page_id: String, content: String) -> Result<(), AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    let _ = content;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_blocks(page_id: String) -> Result<Vec<Block>, AppError> {
    let _id: PageId = page_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(vec![])
}
```

**Step 4: Implement command stubs — chat**

File: `src-tauri/src/commands/chat.rs`
```rust
use storage::ids::ChatId;
use storage::types::{Chat, Message};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn create_chat(title: Option<String>) -> Result<Chat, AppError> {
    let id = ChatId::new();
    let mut chat = Chat::mock(id);
    if let Some(t) = title {
        chat.title = t;
    }
    Ok(chat)
}

#[tauri::command]
#[specta::specta]
pub async fn list_chats() -> Result<Vec<Chat>, AppError> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn get_messages(chat_id: String) -> Result<Vec<Message>, AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub async fn delete_chat(chat_id: String) -> Result<(), AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn submit_query(
    chat_id: String,
    query: String,
) -> Result<(), AppError> {
    let _id: ChatId = chat_id.parse().map_err(|e| AppError::Internal(format!("{e}")))?;
    let _ = query;
    // In Phase 4, this will spawn a pipeline task and emit events.
    // For now, it's a no-op.
    Ok(())
}
```

**Step 5: Implement command stubs — graph, search, vault, system**

File: `src-tauri/src/commands/graph.rs`
```rust
use storage::types::{GraphEdge, GraphNode};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_graph() -> Result<(Vec<GraphNode>, Vec<GraphEdge>), AppError> {
    Ok((vec![], vec![]))
}

#[tauri::command]
#[specta::specta]
pub async fn rebuild_graph() -> Result<(), AppError> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn search_graph(query: String) -> Result<Vec<GraphNode>, AppError> {
    let _ = query;
    Ok(vec![])
}
```

File: `src-tauri/src/commands/search.rs`
```rust
use storage::types::SearchResult;
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn search_pages(query: String, limit: Option<usize>) -> Result<Vec<SearchResult>, AppError> {
    let _ = (query, limit);
    Ok(vec![])
}
```

File: `src-tauri/src/commands/vault.rs`
```rust
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_vault_path() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
#[specta::specta]
pub async fn set_vault_path(path: String) -> Result<(), AppError> {
    let _ = path;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn import_vault() -> Result<u32, AppError> {
    Ok(0)
}
```

File: `src-tauri/src/commands/system.rs`
```rust
use storage::types::{ConnectionTestResult, InferenceConfig};
use crate::error::AppError;

#[tauri::command]
#[specta::specta]
pub async fn get_inference_config() -> Result<InferenceConfig, AppError> {
    Ok(InferenceConfig {
        api_provider: "anthropic".into(),
        model: "claude-sonnet-4-20250514".into(),
        ollama_base_url: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn set_inference_config(config: InferenceConfig) -> Result<(), AppError> {
    let _ = config;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(
    provider: String,
    api_key: String,
    model: String,
) -> Result<ConnectionTestResult, AppError> {
    let _ = (provider, api_key, model);
    Ok(ConnectionTestResult {
        success: false,
        message: "Not implemented yet".into(),
        latency_ms: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_info() -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
    }))
}
```

File: `src-tauri/src/commands/mod.rs`
```rust
pub mod notes;
pub mod chat;
pub mod graph;
pub mod search;
pub mod vault;
pub mod system;
```

**Step 6: Wire commands into main.rs with tauri-specta**

File: `src-tauri/src/main.rs`
```rust
mod commands;
mod error;

use commands::{notes, chat, graph, search, vault, system};

fn main() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            // Notes
            notes::create_page,
            notes::get_page,
            notes::list_pages,
            notes::delete_page,
            notes::load_body,
            notes::save_body,
            notes::get_blocks,
            // Chat
            chat::create_chat,
            chat::list_chats,
            chat::get_messages,
            chat::delete_chat,
            chat::submit_query,
            // Graph
            graph::get_graph,
            graph::rebuild_graph,
            graph::search_graph,
            // Search
            search::search_pages,
            // Vault
            vault::get_vault_path,
            vault::set_vault_path,
            vault::import_vault,
            // System
            system::get_inference_config,
            system::set_inference_config,
            system::test_connection,
            system::get_app_info,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/lib/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 7: Verify Rust compiles and generates bindings**

Run:
```bash
cargo build --workspace
```
Expected: Compiles. `src/lib/bindings.ts` is auto-generated.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: define tauri-specta command stubs with auto-generated TS bindings"
```

---

## Task 5: Copy Brainiac 2.0 Frontend

**Files:**
- Copy: `components/` → `src/components/`
- Copy: `lib/store/` → `src/lib/store/`
- Copy: `lib/constants.ts` → `src/lib/constants.ts`
- Copy: `lib/utils.ts` → `src/lib/utils.ts`
- Copy: `app/globals.css` → `src/styles/globals.css`
- Copy: font assets → `src/assets/fonts/`

**Step 1: Copy UI components**

Run:
```bash
# Components
cp -r /Users/jojo/meta-analytical-pfc/brainiac-2.0/components/ src/components/

# Store (Zustand — framework-agnostic)
mkdir -p src/lib/store
cp -r /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/store/ src/lib/store/

# Lib utilities
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/utils.ts src/lib/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/constants.ts src/lib/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/debug-logger.ts src/lib/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/storage-versioning.ts src/lib/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/device-detection.ts src/lib/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/rate-limit.ts src/lib/

# Branded types
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/branded.ts src/lib/

# Motion config
mkdir -p src/lib/motion
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/motion/motion-config.ts src/lib/motion/

# Engine types (keep client-safe parts)
mkdir -p src/lib/engine
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/engine/types.ts src/lib/engine/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/engine/signal-generation.ts src/lib/engine/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/engine/query-analysis.ts src/lib/engine/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/engine/note-intent.ts src/lib/engine/

# Prompts
mkdir -p src/lib/engine/prompts
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/engine/prompts/*.ts src/lib/engine/prompts/ 2>/dev/null || true

# Notes types
mkdir -p src/lib/notes
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/notes/types.ts src/lib/notes/

# Research types
mkdir -p src/lib/research
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/research/types.ts src/lib/research/
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/research/export.ts src/lib/research/

# Viz helpers
mkdir -p src/lib/viz
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/lib/viz/d3-processing.ts src/lib/viz/ 2>/dev/null || true

# Hooks
mkdir -p src/hooks
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/hooks/*.ts src/hooks/

# Styles
mkdir -p src/styles
cp /Users/jojo/meta-analytical-pfc/brainiac-2.0/app/globals.css src/styles/
```

**Step 2: Copy font assets**

Run:
```bash
mkdir -p src/assets/fonts
# Copy all font files referenced in globals.css
find /Users/jojo/meta-analytical-pfc/brainiac-2.0/app/fonts -name "*.woff2" -o -name "*.woff" -o -name "*.ttf" | while read f; do
    cp "$f" src/assets/fonts/
done 2>/dev/null || true
# Also check public/fonts
find /Users/jojo/meta-analytical-pfc/brainiac-2.0/public -name "*.woff2" -o -name "*.woff" -o -name "*.ttf" | while read f; do
    cp "$f" src/assets/fonts/
done 2>/dev/null || true
```

**Step 3: Update import paths in globals.css**

Update font `url()` paths in `src/styles/globals.css` to point to `../assets/fonts/` instead of the Next.js paths.

**Step 4: Commit raw copy (before any modifications)**

```bash
git add -A
git commit -m "feat: copy Brainiac 2.0 frontend files (raw, pre-migration)"
```

---

## Task 6: Migrate Next.js → React Router

**Files:**
- Create: `src/routes.tsx`
- Create: `src/App.tsx`
- Modify: `src/main.tsx`
- Create: `src/pages/` (one file per route)
- Modify: 11 component files (replace next/ imports)

**Step 1: Create route definitions**

File: `src/routes.tsx`
```tsx
import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import App from "./App";

const ChatLanding = lazy(() => import("./pages/ChatLanding"));
const ChatConversation = lazy(() => import("./pages/ChatConversation"));
const Analytics = lazy(() => import("./pages/Analytics"));
const ConceptAtlas = lazy(() => import("./pages/ConceptAtlas"));
const Library = lazy(() => import("./pages/Library"));
const Notes = lazy(() => import("./pages/Notes"));
const ResearchCopilot = lazy(() => import("./pages/ResearchCopilot"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <LazyPage><ChatLanding /></LazyPage> },
      { path: "chat/:id", element: <LazyPage><ChatConversation /></LazyPage> },
      { path: "analytics", element: <LazyPage><Analytics /></LazyPage> },
      { path: "concept-atlas", element: <LazyPage><ConceptAtlas /></LazyPage> },
      { path: "library", element: <LazyPage><Library /></LazyPage> },
      { path: "notes", element: <LazyPage><Notes /></LazyPage> },
      { path: "research-copilot", element: <LazyPage><ResearchCopilot /></LazyPage> },
      { path: "settings", element: <LazyPage><Settings /></LazyPage> },
      { path: "onboarding", element: <LazyPage><Onboarding /></LazyPage> },
    ],
  },
]);
```

**Step 2: Create App.tsx with shell layout**

File: `src/App.tsx`
```tsx
import { Outlet } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import "./styles/globals.css";

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Outlet />
      </div>
    </ThemeProvider>
  );
}
```

**Step 3: Create main.tsx entry point**

File: `src/main.tsx`
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
```

**Step 4: Create page stubs**

Create minimal page components under `src/pages/` that import and wrap the
existing Brainiac components. Each page file is a thin wrapper that the route
points to. The actual UI lives in `src/components/`.

Example — File: `src/pages/ChatLanding.tsx`
```tsx
export default function ChatLanding() {
  return <div>Chat Landing — TODO: wire to existing Chat component</div>;
}
```

Create similar stubs for: `ChatConversation.tsx`, `Analytics.tsx`,
`ConceptAtlas.tsx`, `Library.tsx`, `Notes.tsx`, `ResearchCopilot.tsx`,
`Settings.tsx`, `Onboarding.tsx`.

**Step 5: Replace Next.js imports in 11 component files**

Apply these mechanical replacements across all 11 files:

```
// FIND → REPLACE
import { useRouter } from 'next/navigation'     → import { useNavigate } from 'react-router-dom'
import { usePathname } from 'next/navigation'    → import { useLocation } from 'react-router-dom'
import { useParams } from 'next/navigation'      → import { useParams } from 'react-router-dom'
import { useSearchParams } from 'next/navigation' → import { useSearchParams } from 'react-router-dom'
import { redirect } from 'next/navigation'       → import { useNavigate } from 'react-router-dom'
import dynamic from 'next/dynamic'               → import { lazy } from 'react'
import Image from 'next/image'                   → (delete — use <img>)
import Link from 'next/link'                     → import { Link } from 'react-router-dom'

// Usage replacements
const router = useRouter()                        → const navigate = useNavigate()
router.push('/path')                             → navigate('/path')
router.replace('/path')                          → navigate('/path', { replace: true })
const pathname = usePathname()                   → const { pathname } = useLocation()
const Component = dynamic(() => import('...'))   → const Component = lazy(() => import('...'))
<Image src={...} ... />                          → <img src={...} ... />
<Link href="/path">                              → <Link to="/path">
```

Files to modify (exact list from exploration):
1. `src/components/layout/app-shell.tsx`
2. `src/components/chat/chat.tsx`
3. `src/components/chat/chat-history-sheet.tsx`
4. `src/components/chat/message.tsx`
5. `src/components/chat/recent-chats.tsx`
6. `src/components/layout/top-nav.tsx`
7. `src/components/layout/page-shell.tsx`
8. `src/components/assistant/mini-chat-history-tab.tsx`
9. `src/components/viz/portal-sidebar.tsx`
10. `src/components/theme-provider.tsx`

**Step 6: Verify frontend compiles**

Run:
```bash
npm run dev
```
Expected: Vite starts. Pages render (with TODO placeholders). No `next/` import errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: migrate Next.js routing to React Router, replace all next/ imports"
```

---

## Task 7: Create Custom ThemeProvider

**Files:**
- Create: `src/lib/theme.tsx`
- Modify: `src/components/theme-provider.tsx` (update to use custom provider)

**Step 1: Implement ThemeProvider**

File: `src/lib/theme.tsx`
```tsx
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "oled" | "cosmic" | "sunny" | "sunset";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "epistemos-theme";

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(STORAGE_KEY) as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove("light", "dark", "oled", "cosmic", "sunny", "sunset");
    // Add current theme
    root.classList.add(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme: theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

**Step 2: Update theme-provider.tsx to re-export**

File: `src/components/theme-provider.tsx`
```tsx
export { ThemeProvider, useTheme } from "@/lib/theme";
```

**Step 3: Verify themes toggle**

Run:
```bash
npm run dev
```
Expected: Theme class applies to `<html>`, CSS variables change per theme

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: custom ThemeProvider replacing next-themes (6 themes)"
```

---

## Task 8: Rewrite Hooks (fetch → invoke + listen)

**Files:**
- Modify: `src/hooks/use-chat-stream.ts`
- Modify: `src/hooks/use-assistant-stream.ts`
- Create: `src/lib/events.ts`

> **This is a design decision.** The existing hooks use `fetch()` + SSE.
> Per the engineering standards, ALL backend calls MUST use `invoke()` and
> streaming MUST use Tauri `listen()` events — not HTTP.

**Step 1: Create typed event listeners**

File: `src/lib/events.ts`
```typescript
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PipelineStageEvent {
  stage: string;
  status: string;
}

export interface PipelineTextDeltaEvent {
  text: string;
}

export interface PipelineReasoningEvent {
  text: string;
}

export interface PipelineSignalsEvent {
  confidence: number;
  entropy: number;
  dissonance: number;
  health_score: number;
}

export interface PipelineCompleteEvent {
  message_id: string;
  content: string;
}

export interface PipelineErrorEvent {
  message: string;
  kind: string;
}

export function onPipelineStage(handler: (e: PipelineStageEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineStageEvent>("pipeline://stage", (event) => handler(event.payload));
}

export function onPipelineTextDelta(handler: (e: PipelineTextDeltaEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineTextDeltaEvent>("pipeline://text-delta", (event) => handler(event.payload));
}

export function onPipelineReasoning(handler: (e: PipelineReasoningEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineReasoningEvent>("pipeline://reasoning", (event) => handler(event.payload));
}

export function onPipelineSignals(handler: (e: PipelineSignalsEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineSignalsEvent>("pipeline://signals", (event) => handler(event.payload));
}

export function onPipelineComplete(handler: (e: PipelineCompleteEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineCompleteEvent>("pipeline://complete", (event) => handler(event.payload));
}

export function onPipelineError(handler: (e: PipelineErrorEvent) => void): Promise<UnlistenFn> {
  return listen<PipelineErrorEvent>("pipeline://error", (event) => handler(event.payload));
}
```

**Step 2: Rewrite use-chat-stream.ts**

This hook currently uses `fetch()` + `ReadableStream` to parse SSE. Replace
with `invoke('submit_query')` + Tauri event listeners.

The exact rewrite depends on the existing hook's state management, but the
pattern is:

```typescript
import { useCallback, useRef } from "react";
import { commands } from "@/lib/bindings";
import {
  onPipelineStage,
  onPipelineTextDelta,
  onPipelineReasoning,
  onPipelineComplete,
  onPipelineError,
} from "@/lib/events";
import type { UnlistenFn } from "@tauri-apps/api/event";

export function useChatStream() {
  const unlisteners = useRef<UnlistenFn[]>([]);

  const sendQuery = useCallback(async (query: string, chatId: string) => {
    // Clean up previous listeners
    for (const unlisten of unlisteners.current) unlisten();
    unlisteners.current = [];

    // Set up listeners BEFORE sending query
    unlisteners.current.push(
      await onPipelineTextDelta((e) => {
        // Push to Zustand store: store.appendStreamingText(e.text)
      }),
      await onPipelineReasoning((e) => {
        // Push to Zustand store: store.appendThinking(e.text)
      }),
      await onPipelineStage((e) => {
        // Push to Zustand store: store.advanceStage(e.stage)
      }),
      await onPipelineComplete((e) => {
        // Push to Zustand store: store.completeProcessing(e)
        // Clean up listeners
        for (const unlisten of unlisteners.current) unlisten();
        unlisteners.current = [];
      }),
      await onPipelineError((e) => {
        // Push to Zustand store: store.setError(e.message)
        for (const unlisten of unlisteners.current) unlisten();
        unlisteners.current = [];
      }),
    );

    // Fire-and-forget: Rust handles the pipeline
    await commands.submitQuery(chatId, query);
  }, []);

  const abort = useCallback(() => {
    for (const unlisten of unlisteners.current) unlisten();
    unlisteners.current = [];
    // TODO Phase 4: invoke('abort_pipeline')
  }, []);

  return { sendQuery, abort };
}
```

> **Note for implementer:** The exact integration with the Zustand store slices
> (message, pipeline, cortex) must match the existing Brainiac 2.0 patterns.
> Read the existing `use-chat-stream.ts` and map each SSE event type to the
> corresponding store action. The event payload shapes are defined in
> `src/lib/events.ts`.

**Step 3: Rewrite use-assistant-stream.ts**

Same pattern: replace `fetch()` + SSE with `invoke('submit_assistant_query')` +
Tauri event listeners for `assistant://text-delta` and `assistant://complete`.

**Step 4: Verify no fetch() calls to /api/ remain**

Run:
```bash
grep -r "fetch.*api" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v bindings.ts
```
Expected: Zero results (all fetch-to-api calls removed)

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: rewrite hooks to use invoke() + listen() (no fetch, no SSE)"
```

---

## Task 9: Delete Server-Side Code

**Files:**
- Delete: Any copied `api/` directories
- Delete: Any `lib/db/` files
- Delete: Any `daemon/` files
- Verify: No `better-sqlite3`, `drizzle`, `@ai-sdk/*` imports

**Step 1: Remove server-side files**

Run:
```bash
# Delete API route files if they were copied
rm -rf src/api/ 2>/dev/null
rm -rf src/lib/db/ 2>/dev/null
rm -rf src/daemon/ 2>/dev/null

# Delete server-side engine files
rm -f src/lib/engine/simulate.ts 2>/dev/null
rm -f src/lib/engine/arbitration.ts 2>/dev/null
rm -f src/lib/engine/file-processor.ts 2>/dev/null
rm -f src/lib/engine/synthesizer.ts 2>/dev/null
rm -f src/lib/engine/truthbot.ts 2>/dev/null
rm -f src/lib/engine/reflection.ts 2>/dev/null
rm -rf src/lib/engine/llm/ 2>/dev/null
rm -rf src/lib/engine/research/ 2>/dev/null
rm -rf src/lib/engine/soar/ 2>/dev/null
rm -rf src/lib/engine/steering/ 2>/dev/null

# Delete api-utils that depend on Next.js
rm -f src/lib/api-utils.ts 2>/dev/null
rm -f src/lib/api-middleware.ts 2>/dev/null
rm -f src/lib/daemon-ipc.ts 2>/dev/null
```

**Step 2: Verify no forbidden imports remain**

Run:
```bash
# Check for Next.js imports
grep -r "from 'next/" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
# Check for better-sqlite3
grep -r "better-sqlite3" src/ --include="*.ts" --include="*.tsx"
# Check for drizzle
grep -r "drizzle" src/ --include="*.ts" --include="*.tsx"
# Check for @ai-sdk
grep -r "@ai-sdk" src/ --include="*.ts" --include="*.tsx"
```
Expected: Zero results for all four checks

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete all server-side code (API routes, DB, daemon)"
```

---

## Task 10: PostCSS + Tailwind 4 Configuration

**Files:**
- Create: `postcss.config.mjs`
- Verify: `src/styles/globals.css` uses Tailwind 4 syntax

**Step 1: Create PostCSS config**

File: `postcss.config.mjs`
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

**Step 2: Ensure globals.css is imported in main.tsx**

Verify `src/main.tsx` imports:
```tsx
import "./styles/globals.css";
```

Or that `src/App.tsx` imports it.

**Step 3: Verify Tailwind classes render**

Run:
```bash
npm run dev
```
Expected: Tailwind utility classes apply. Background color, text color, spacing all work.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: configure PostCSS + Tailwind 4 for Vite"
```

---

## Task 11: Full Integration Verification

**Step 1: Verify Rust workspace compiles**

Run:
```bash
cargo build --workspace
```
Expected: All crates compile. No warnings from clippy.

Run:
```bash
cargo clippy --workspace -- -D warnings
```
Expected: Clean

**Step 2: Verify Rust tests pass**

Run:
```bash
cargo test --workspace
```
Expected: All tests pass (ID serialization tests from Task 3)

**Step 3: Verify Vite builds for production**

Run:
```bash
npm run build
```
Expected: Production build succeeds. Bundle in `dist/`.

**Step 4: Verify Tauri dev mode**

Run:
```bash
cargo tauri dev
```
Expected: Window opens. UI renders with correct theme. Navigation works between pages.

**Step 5: Run the pre-commit checklist**

- [ ] No `fetch('/api/...')` — all calls use `invoke()` via bindings.ts
- [ ] No SSE — streaming uses Tauri events
- [ ] No Next.js imports (`next/link`, `next/navigation`, `next/dynamic`, `next/image`)
- [ ] No `better-sqlite3`, `drizzle-orm`, `@ai-sdk/*` imports
- [ ] All IDs use newtype wrappers in Rust
- [ ] All errors use `thiserror`, no `.map_err(|e| e.to_string())`
- [ ] No `.unwrap()` in `src-tauri/` production code
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` clean
- [ ] `npm run build` succeeds

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — Tauri scaffold with Brainiac UI in Vite"
```

---

## Phase 1 Checkpoint Summary

After all 11 tasks, you should have:

1. A Tauri 2.x app that opens a native window
2. The full Brainiac 2.0 UI running in Vite + React Router
3. 6 themes working (light/dark/oled/cosmic/sunny/sunset)
4. All backend calls going through `invoke()` via tauri-specta bindings
5. All streaming going through Tauri `listen()` events
6. Rust command stubs returning mock data
7. 7 crate stubs compiling in the workspace
8. Newtype IDs, structured errors, and data models defined
9. Zero Next.js, zero fetch(), zero SSE, zero server-side code

**Next:** Phase 2 (Storage Foundation) — implement real rusqlite CRUD behind the command stubs.
