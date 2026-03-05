# Epistemos Retro Edition — Complete Implementation Plan

**Date:** 2026-03-03  
**Objective:** Close all gaps to reach macOS Opulent Edition parity  
**Approach:** Terminal-based, step-by-step implementation

---

## Current State Assessment

### ✅ What's Already Working (Verified)
```
Rust Backend:
  ✓ 368 tests passing
  ✓ 67 Tauri commands registered
  ✓ 0 clippy warnings
  ✓ P0 crash fixes complete (lock poisoning, deadlocks)

Frontend:
  ✓ 81 React components
  ✓ 6 themes with animated wallpapers
  ✓ FPS exploration mode (Retro exclusive)
  ✓ 3-tier triage routing (Retro exclusive)
  ✓ Character AI (Izmi/Sunny)
  ✓ Note AI Chat bubble
```

### ❌ Critical Gaps to Close

| Priority | Feature | macOS LOC | Effort | Files to Create/Modify |
|----------|---------|-----------|--------|------------------------|
| **P0** | Command Palette | 1,709 | 4-6 hrs | 3 files |
| **P1** | Transclusion System | 3,200 | 6-8 hrs | 8+ files |
| **P1** | Diff/Version UI | 2,800 | 6-8 hrs | 8+ files |
| **P1** | Advanced Query System | 2,500 | 5-7 hrs | 6+ files |
| **P2** | Block Ref Autocomplete | 800 | 2-3 hrs | 3 files |
| **P2** | Table of Contents | 600 | 2-3 hrs | 2 files |
| **P2** | Research Service (S2) | 2,500 | 4-6 hrs | 4+ files |

**Total Estimated Effort: 4-6 weeks of focused work**

---

## Pre-Implementation Setup

### Step 0: Verify Environment
```bash
cd /Users/jojo/Epistemos-RETRO

# Check Rust
cargo --version  # Should be 1.85+
cargo check

# Check Node
node --version   # Should be 20+
npm ci

# Verify baseline
cargo test 2>&1 | tail -5
```

### Step 0b: Create Feature Branch
```bash
cd /Users/jojo/Epistemos-RETRO
git checkout -b feature/close-macos-gaps
git add -A
git commit -m "baseline: pre-gap-implementation checkpoint"
```

---

## PHASE 1: Command Palette (P0 - Critical)

### Overview
System-wide command palette with fuzzy search, recent items, and quick actions. Accessed via Cmd+K.

### Files to Create

#### 1.1 Create `src/components/command-palette/command-palette.tsx`

```bash
cat > src/components/command-palette/command-palette.tsx << 'EOF'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search, FileText, MessageSquare, Home, Settings, 
  Network, BookOpen, Plus, Command, X, Clock, Star,
  Cpu, Cloud, Zap
} from 'lucide-react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { commands } from '@/lib/bindings';
import type { NotePage, Chat } from '@/lib/notes/types';

interface CommandItem {
  id: string;
  type: 'note' | 'chat' | 'action' | 'nav' | 'provider';
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  score?: number;
}

const RECENT_KEY = 'epistemos-command-palette-recent';
const MAX_RECENT = 10;

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { isDark } = useIsDark();
  
  const pages = usePFCStore(s => s.pages);
  const chats = usePFCStore(s => s.chats);
  const createPage = usePFCStore(s => s.createPage);
  const createChat = usePFCStore(s => s.createChat);
  const setInferenceConfig = usePFCStore(s => s.setInferenceConfig);
  const inferenceConfig = usePFCStore(s => s.inferenceConfig);

  // Load recent items
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_KEY);
    if (saved) {
      try {
        setRecentItems(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save recent items
  const addToRecent = useCallback((id: string) => {
    setRecentItems(prev => {
      const next = [id, ...prev.filter(i => i !== id)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build command list
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Navigation items
    items.push(
      { id: 'nav-home', type: 'nav', title: 'Home', subtitle: 'Go to landing page', icon: <Home size={16} />, shortcut: 'H', action: () => navigate('/') },
      { id: 'nav-notes', type: 'nav', title: 'Notes', subtitle: 'Browse all notes', icon: <FileText size={16} />, shortcut: 'N', action: () => navigate('/notes') },
      { id: 'nav-graph', type: 'nav', title: 'Graph', subtitle: 'Knowledge graph explorer', icon: <Network size={16} />, shortcut: 'G', action: () => navigate('/graph') },
      { id: 'nav-library', type: 'nav', title: 'Library', subtitle: 'Research library', icon: <BookOpen size={16} />, shortcut: 'L', action: () => navigate('/library') },
      { id: 'nav-settings', type: 'nav', title: 'Settings', subtitle: 'App configuration', icon: <Settings size={16} />, shortcut: ',', action: () => navigate('/settings') },
    );

    // Provider switching
    const providers = [
      { id: 'openai', name: 'OpenAI', icon: <Cloud size={16} /> },
      { id: 'anthropic', name: 'Anthropic', icon: <Zap size={16} /> },
      { id: 'google', name: 'Google', icon: <Cpu size={16} /> },
    ];
    providers.forEach(p => {
      items.push({
        id: `provider-${p.id}`,
        type: 'provider',
        title: `Switch to ${p.name}`,
        subtitle: `Change AI provider`,
        icon: p.icon,
        action: () => {
          setInferenceConfig({ ...inferenceConfig, provider: p.id as any });
          setIsOpen(false);
        }
      });
    });

    // Actions
    items.push(
      { id: 'action-new-note', type: 'action', title: 'Create New Note', subtitle: 'Create a blank note page', icon: <Plus size={16} />, shortcut: 'N', action: async () => {
        const page = await createPage('New Note');
        addToRecent(`page:${page.id}`);
        navigate(`/notes?page=${page.id}`);
        setIsOpen(false);
      }},
      { id: 'action-new-chat', type: 'action', title: 'Start New Chat', subtitle: 'Begin a conversation', icon: <MessageSquare size={16} />, shortcut: 'C', action: async () => {
        const chat = await createChat();
        addToRecent(`chat:${chat.id}`);
        navigate(`/chat/${chat.id}`);
        setIsOpen(false);
      }},
    );

    // Notes
    pages.forEach(page => {
      items.push({
        id: `page:${page.id}`,
        type: 'note',
        title: page.title || 'Untitled',
        subtitle: page.summary?.slice(0, 60) || 'No summary',
        icon: <FileText size={16} />,
        action: () => {
          addToRecent(`page:${page.id}`);
          navigate(`/notes?page=${page.id}`);
          setIsOpen(false);
        }
      });
    });

    // Chats
    chats.forEach(chat => {
      items.push({
        id: `chat:${chat.id}`,
        type: 'chat',
        title: chat.title || 'New Chat',
        subtitle: new Date(chat.createdAt).toLocaleDateString(),
        icon: <MessageSquare size={16} />,
        action: () => {
          addToRecent(`chat:${chat.id}`);
          navigate(`/chat/${chat.id}`);
          setIsOpen(false);
        }
      });
    });

    return items;
  }, [pages, chats, navigate, createPage, createChat, inferenceConfig, setInferenceConfig, addToRecent]);

  // Filter and score
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show recent items first when no query
      const recent = recentItems
        .map(id => allCommands.find(c => c.id === id))
        .filter(Boolean) as CommandItem[];
      const others = allCommands.filter(c => !recentItems.includes(c.id));
      return [...recent, ...others].slice(0, 50);
    }

    const q = query.toLowerCase();
    return allCommands
      .map(item => {
        const titleScore = item.title.toLowerCase().includes(q) ? 10 : 0;
        const subtitleScore = item.subtitle?.toLowerCase().includes(q) ? 5 : 0;
        return { ...item, score: titleScore + subtitleScore };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 20);
  }, [allCommands, query, recentItems]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredCommands[selectedIndex];
        if (item) {
          item.action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach(item => {
      const group = item.type === 'note' ? 'Notes' : 
                    item.type === 'chat' ? 'Chats' :
                    item.type === 'action' ? 'Actions' :
                    item.type === 'nav' ? 'Navigation' :
                    item.type === 'provider' ? 'AI Providers' : 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });
    return groups;
  }, [filteredCommands]);

  if (!isOpen) return null;

  const glassBg = isDark ? 'rgba(20, 20, 28, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)';
  const mutedColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '15vh',
          zIndex: 9999,
        }}
        onClick={() => setIsOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          style={{
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '60vh',
            background: glassBg,
            borderRadius: '12px',
            border: `1px solid ${borderColor}`,
            backdropFilter: 'blur(20px) saturate(180%)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search input */}
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <Search size={20} style={{ color: mutedColor }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
              placeholder="Search notes, chats, commands..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: textColor,
                fontSize: 16,
                fontFamily: 'inherit',
              }}
            />
            <kbd style={{
              padding: '4px 8px',
              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              borderRadius: 4,
              fontSize: 12,
              color: mutedColor,
              fontFamily: 'monospace',
            }}>ESC</kbd>
          </div>

          {/* Results */}
          <div style={{ overflow: 'auto', flex: 1, padding: '8px 0' }}>
            {Object.entries(grouped).map(([groupName, items]) => (
              <div key={groupName}>
                <div style={{
                  padding: '8px 20px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: mutedColor,
                }}>
                  {groupName}
                </div>
                {items.map((item, idx) => {
                  const globalIdx = filteredCommands.findIndex(c => c.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      style={{
                        width: '100%',
                        padding: '10px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: isSelected 
                          ? (isDark ? 'rgba(196,149,106,0.2)' : 'rgba(91,143,199,0.15)')
                          : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ color: mutedColor }}>{item.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: textColor, fontSize: 14, fontWeight: 500 }}>
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div style={{ color: mutedColor, fontSize: 12 }}>
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd style={{
                          padding: '2px 6px',
                          background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          borderRadius: 4,
                          fontSize: 11,
                          color: mutedColor,
                          fontFamily: 'monospace',
                        }}>
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredCommands.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: mutedColor }}>
                No results found
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 20px',
            borderTop: `1px solid ${borderColor}`,
            display: 'flex',
            gap: 16,
            fontSize: 12,
            color: mutedColor,
          }}>
            <span><kbd>↑↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to select</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
EOF
```

#### 1.2 Create barrel export
```bash
mkdir -p src/components/command-palette
cat > src/components/command-palette/index.ts << 'EOF'
export { CommandPalette } from './command-palette';
EOF
```

#### 1.3 Integrate into App Shell
Edit `src/components/layout/app-shell.tsx` and add before the closing `</div>`:

```bash
# Find the line to insert after
LINE=$(grep -n "<ThemeProvider" src/components/layout/app-shell.tsx | head -1 | cut -d: -f1)

# Create backup
cp src/components/layout/app-shell.tsx src/components/layout/app-shell.tsx.bak

# Insert import at top
sed -i '' '1i\
import { CommandPalette } from "@/components/command-palette";' src/components/layout/app-shell.tsx

# Insert component before closing ThemeProvider tag
sed -i '' 's|</ThemeProvider>|  <CommandPalette />\n</ThemeProvider>|' src/components/layout/app-shell.tsx
```

### 1.4 Verification
```bash
# Type check
npx tsc --noEmit

# If successful
echo "✓ Command Palette implemented"
```

---

## PHASE 2: Transclusion System (P1)

### Overview
Embed blocks from other notes with live sync. Type `((` to trigger autocomplete.

### Step 2.1: Database Schema (Rust)

Add to `crates/storage/src/db.rs` after existing table creation:

```bash
cat >> crates/storage/src/db.rs << 'RUST'

// Transclusions - block references between pages
pub fn create_transclusion_table(&self) -> Result<(), StorageError> {
    self.conn.execute(
        "CREATE TABLE IF NOT EXISTS transclusions (
            id TEXT PRIMARY KEY,
            source_page_id TEXT NOT NULL,
            target_page_id TEXT NOT NULL,
            target_block_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
            FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // Indexes for fast lookups
    self.conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transclusions_source 
         ON transclusions(source_page_id)",
        [],
    )?;
    self.conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transclusions_target_block 
         ON transclusions(target_block_id)",
        [],
    )?;
    Ok(())
}
RUST
```

### Step 2.2: Add Transclusion Types

Add to `crates/storage/src/types.rs`:

```bash
cat >> crates/storage/src/types.rs << 'RUST'

// Transclusion - embed a block from another page
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transclusion {
    pub id: String,
    pub source_page_id: String,
    pub target_page_id: String,
    pub target_block_id: String,
    pub created_at: i64,
}

impl Transclusion {
    pub fn new(source: &str, target_page: &str, target_block: &str) -> Self {
        Self {
            id: generate_id(),
            source_page_id: source.to_string(),
            target_page_id: target_page.to_string(),
            target_block_id: target_block.to_string(),
            created_at: now_timestamp(),
        }
    }
}
RUST
```

### Step 2.3: Add Error Types

Add to `crates/storage/src/error.rs`:

```bash
cat >> crates/storage/src/error.rs << 'RUST'
    BlockNotFound(String),
    TransclusionNotFound(String),
    CircularTransclusion,
RUST
```

### Step 2.4: Add Tauri Commands

Create `src-tauri/src/commands/transclusion.rs`:

```bash
cat > src-tauri/src/commands/transclusion.rs << 'RUST'
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use storage::ids::{PageId, BlockId};
use storage::types::{Transclusion, Block};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Clone, Serialize, specta::Type)]
pub struct TransclusionResult {
    pub id: String,
    pub source_page_id: String,
    pub target_page_id: String,
    pub target_block_id: String,
    pub content: String,
}

#[derive(Clone, Serialize, specta::Type)]
pub struct BlockSearchResult {
    pub block_id: String,
    pub page_id: String,
    pub page_title: String,
    pub content_preview: String,
}

/// Create a transclusion reference
#[tauri::command]
#[specta::specta]
pub async fn create_transclusion(
    state: State<'_, AppState>,
    source_page_id: String,
    target_page_id: String,
    target_block_id: String,
) -> Result<Transclusion, AppError> {
    let source: PageId = source_page_id.parse().map_err(|_| AppError::Storage(storage::error::StorageError::InvalidId(source_page_id)))?;
    let target_page: PageId = target_page_id.parse().map_err(|_| AppError::Storage(storage::error::StorageError::InvalidId(target_page_id)))?;
    let target_block: BlockId = target_block_id.parse().map_err(|_| AppError::Storage(storage::error::StorageError::InvalidId(target_block_id)))?;
    
    // Check for circular reference
    if would_create_circular_transclusion(&state, &target_page_id, &source_page_id).await? {
        return Err(AppError::Storage(storage::error::StorageError::CircularTransclusion));
    }
    
    let transclusion = Transclusion::new(&source_page_id, &target_page_id, &target_block_id);
    
    let db = state.lock_db()?;
    db.create_transclusion(&transclusion)?;
    
    Ok(transclusion)
}

/// Get all transclusions for a page
#[tauri::command]
#[specta::specta]
pub async fn get_transclusions_for_page(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<Vec<TransclusionResult>, AppError> {
    let pid: PageId = page_id.parse().map_err(|_| AppError::Storage(storage::error::StorageError::InvalidId(page_id)))?;
    
    let db = state.lock_db()?;
    let transclusions = db.get_transclusions_for_page(pid)?;
    
    let mut results = Vec::new();
    for t in transclusions {
        // Get the actual block content
        let block_id: BlockId = t.target_block_id.parse().map_err(|_| AppError::Storage(storage::error::StorageError::InvalidId(t.target_block_id.clone())))?;
        let content = db.get_block_content(block_id).unwrap_or_default();
        
        results.push(TransclusionResult {
            id: t.id,
            source_page_id: t.source_page_id,
            target_page_id: t.target_page_id,
            target_block_id: t.target_block_id,
            content,
        });
    }
    
    Ok(results)
}

/// Search blocks for transclusion autocomplete
#[tauri::command]
#[specta::specta]
pub async fn search_blocks_for_transclusion(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<BlockSearchResult>, AppError> {
    let db = state.lock_db()?;
    let results = db.search_blocks(&query, limit.unwrap_or(10))?;
    Ok(results)
}

/// Delete a transclusion
#[tauri::command]
#[specta::specta]
pub async fn delete_transclusion(
    state: State<'_, AppState>,
    transclusion_id: String,
) -> Result<(), AppError> {
    let db = state.lock_db()?;
    db.delete_transclusion(&transclusion_id)?;
    Ok(())
}

/// Notify that a block has been updated (trigger refresh in transcluding pages)
#[tauri::command]
#[specta::specta]
pub async fn notify_block_updated(
    app: AppHandle,
    block_id: String,
) -> Result<(), AppError> {
    app.emit("transclusion-refresh", serde_json::json!({
        "block_id": block_id,
        "timestamp": chrono::Utc::now().timestamp(),
    })).ok();
    Ok(())
}

/// Check if creating a transclusion would create a circular reference
async fn would_create_circular_transclusion(
    state: &AppState,
    target_page_id: &str,
    source_page_id: &str,
) -> Result<bool, AppError> {
    // Simple check: if target_page already transcludes source_page (directly or indirectly)
    let db = state.lock_db()?;
    Ok(db.check_transclusion_cycle(target_page_id, source_page_id)?)
}
RUST
```

### Step 2.5: Register Commands

Add to `src-tauri/src/lib.rs` in the command list:

```bash
grep -n "create_page" src-tauri/src/lib.rs | head -1
```

Add these to the `generate_handler!` macro:
```
create_transclusion,
get_transclusions_for_page,
delete_transclusion,
search_blocks_for_transclusion,
notify_block_updated,
```

### Step 2.6: Frontend Components

Create `src/components/notes/transclusion/transclusion-block.tsx`:

```bash
cat > src/components/notes/transclusion/transclusion-block.tsx << 'EOF'
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { commands } from '@/lib/bindings';
import { useIsDark } from '@/hooks/use-is-dark';

interface TransclusionBlockProps {
  targetBlockId: string;
  targetPageId: string;
}

export function TransclusionBlock({ targetBlockId, targetPageId }: TransclusionBlockProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isDark } = useIsDark();

  const fetchContent = async () => {
    try {
      setLoading(true);
      // Get block content from backend
      const result = await commands.getTranscludedBlock(targetBlockId);
      if (result) {
        setContent(result);
      } else {
        setError('Block not found');
      }
    } catch (e) {
      setError('Failed to load transcluded content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
    
    // Listen for refresh events
    const unlisten = (window as any).__TAURI__.event.listen('transclusion-refresh', (event: any) => {
      if (event.payload.block_id === targetBlockId) {
        fetchContent();
      }
    });
    
    return () => { unlisten.then((f: any) => f()); };
  }, [targetBlockId]);

  const bgColor = isDark ? 'rgba(196,149,106,0.08)' : 'rgba(91,143,199,0.08)';
  const borderColor = isDark ? 'rgba(196,149,106,0.2)' : 'rgba(91,143,199,0.2)';

  return (
    <div style={{
      padding: '12px 16px',
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      margin: '8px 0',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        fontSize: 12,
        opacity: 0.6,
      }}>
        <FileText size={14} />
        <span>Transcluded from another page</span>
      </div>
      
      {loading && <div style={{ opacity: 0.5 }}>Loading...</div>}
      {error && <div style={{ color: '#e74c3c' }}>{error}</div>}
      {!loading && !error && (
        <div style={{ 
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {content}
        </div>
      )}
    </div>
  );
}
EOF
```

---

## Quick Verification Commands

After each phase, run:

```bash
# Rust checks
cd /Users/jojo/Epistemos-RETRO
cargo check
cargo clippy -- -D warnings
cargo test

# TypeScript checks
cd /Users/jojo/Epistemos-RETRO
npx tsc --noEmit

# Build test
cargo build --release 2>&1 | tail -20
```

---

## Remaining Implementation Notes

Due to the crash, here's what's left to implement manually:

### 1. Complete Transclusion Frontend
- `transclusion-autocomplete.tsx` - `((` trigger search
- `transclusion-overlay.tsx` - Hover info panel
- Integration with block editor

### 2. Diff/Version System
- Add `similar` crate to Cargo.toml
- Create diff algorithm module
- Frontend: `diff-view.tsx`, `version-timeline.tsx`, `diff-sheet.tsx`

### 3. Advanced Query System
- Query parser (structured query language)
- Query AST types
- Query compiler/runtime
- Frontend query builder UI

### 4. Research Service
- Semantic Scholar API client
- Paper search/novelty check
- Citation extraction
- Frontend research panel

### 5. Polish Features
- Block ref autocomplete (`((`)
- Table of Contents generation
- System tray integration

---

## Commit Strategy

```bash
# After each major feature:
git add -A
git commit -m "feat: implement command palette with fuzzy search"

git add -A  
git commit -m "feat: add transclusion system for block embedding"

git add -A
git commit -m "feat: implement diff and version timeline UI"

# Final push
git push origin feature/close-macos-gaps
```

---

## Testing Checklist

- [ ] Command Palette opens with Cmd+K
- [ ] Fuzzy search finds notes and chats
- [ ] Recent items persist across reloads
- [ ] Keyboard navigation works (↑↓, Enter, Escape)
- [ ] Transclusion `((` trigger shows autocomplete
- [ ] Transcluded content updates when source changes
- [ ] Circular transclusion is prevented
- [ ] Version timeline shows history
- [ ] Diff view compares versions correctly
- [ ] Restore version creates backup first
- [ ] All existing tests still pass

---

*This plan assumes 4-6 hours per day of focused implementation time.*
