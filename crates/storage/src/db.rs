use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

use crate::error::StorageError;
use crate::ids::*;
use crate::types::*;

// Helper to convert optional BlockId to String for rusqlite
fn opt_block_id_to_string(id: Option<BlockId>) -> Option<String> {
    id.map(|b| b.to_string())
}

pub struct Database {
    conn: Connection,
}

impl Database {
    /// Query a PRAGMA value as string (for diagnostics and testing).
    pub fn pragma_str(&self, pragma: &str) -> Result<String, StorageError> {
        let sql = format!("PRAGMA {pragma}");
        Ok(self.conn.query_row(&sql, [], |r| r.get::<_, String>(0))?)
    }

    /// Query a PRAGMA value as integer (for diagnostics and testing).
    pub fn pragma_i64(&self, pragma: &str) -> Result<i64, StorageError> {
        let sql = format!("PRAGMA {pragma}");
        Ok(self.conn.query_row(&sql, [], |r| r.get::<_, i64>(0))?)
    }
    
    /// Get a reference to the underlying SQLite connection.
    /// Used by the query runtime for custom SQL execution.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        // WAL mode: concurrent reads during writes, 2-3x faster writes
        // NORMAL sync: safe against app crashes (tiny risk on OS power loss — acceptable)
        // busy_timeout: wait up to 5s on lock instead of failing immediately
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;",
        )?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<(), StorageError> {
        self.conn.execute_batch(SCHEMA_SQL)?;
        self.run_migrations()?;
        Ok(())
    }

    /// Additive migrations for columns added after initial schema.
    /// Each ALTER TABLE is wrapped in a catch (column may already exist).
    fn run_migrations(&self) -> Result<(), StorageError> {
        // V1: entity_hash column on pages (for graph diff-based persist)
        let _ = self.conn.execute_batch(
            "ALTER TABLE pages ADD COLUMN entity_hash TEXT;"
        );
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Pages
    // ──────────────────────────────────────────────

    pub fn insert_page(&self, page: &Page) -> Result<(), StorageError> {
        let tags_json = serde_json::to_string(&page.tags)?;
        self.conn.execute(
            "INSERT INTO pages (id, title, summary, emoji, research_stage, tags_json,
             word_count, is_pinned, is_archived, is_favorite, is_journal,
             is_locked, sort_order, journal_date, front_matter_data, ideas_data,
             needs_vault_sync, last_synced_body_hash, last_synced_at,
             file_path, subfolder, parent_page_id, folder_id, template_id,
             created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)",
            params![
                page.id.to_string(), page.title, page.summary, page.emoji,
                page.research_stage, tags_json, page.word_count,
                page.is_pinned, page.is_archived, page.is_favorite, page.is_journal,
                page.is_locked, page.sort_order, page.journal_date,
                page.front_matter_data, page.ideas_data,
                page.needs_vault_sync, page.last_synced_body_hash, page.last_synced_at,
                page.file_path, page.subfolder,
                page.parent_page_id.map(|p| p.to_string()),
                page.folder_id.map(|f| f.to_string()),
                page.template_id, page.created_at, page.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_page(&self, id: PageId) -> Result<Page, StorageError> {
        self.conn
            .query_row(
                "SELECT id, title, summary, emoji, research_stage, tags_json,
                 word_count, is_pinned, is_archived, is_favorite, is_journal,
                 is_locked, sort_order, journal_date, front_matter_data, ideas_data,
                 needs_vault_sync, last_synced_body_hash, last_synced_at,
                 file_path, subfolder, parent_page_id, folder_id, template_id,
                 created_at, updated_at
                 FROM pages WHERE id = ?1",
                params![id.to_string()],
                row_to_page,
            )
            .optional()?
            .ok_or(StorageError::PageNotFound(id))
    }

    /// Fast page count without loading all rows. Used for pre-allocation hints.
    pub fn page_count_hint(&self) -> Result<usize, StorageError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pages WHERE is_archived = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    pub fn list_pages(&self) -> Result<Vec<Page>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, summary, emoji, research_stage, tags_json,
             word_count, is_pinned, is_archived, is_favorite, is_journal,
             is_locked, sort_order, journal_date, front_matter_data, ideas_data,
             needs_vault_sync, last_synced_body_hash, last_synced_at,
             file_path, subfolder, parent_page_id, folder_id, template_id,
             created_at, updated_at
             FROM pages ORDER BY updated_at DESC",
        )?;
        let pages = stmt
            .query_map([], row_to_page)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(pages)
    }

    pub fn update_page(&self, page: &Page) -> Result<(), StorageError> {
        let tags_json = serde_json::to_string(&page.tags)?;
        let affected = self.conn.execute(
            "UPDATE pages SET title=?2, summary=?3, emoji=?4, research_stage=?5,
             tags_json=?6, word_count=?7, is_pinned=?8, is_archived=?9,
             is_favorite=?10, is_journal=?11, is_locked=?12, sort_order=?13,
             journal_date=?14, front_matter_data=?15, ideas_data=?16,
             needs_vault_sync=?17, last_synced_body_hash=?18, last_synced_at=?19,
             file_path=?20, subfolder=?21, parent_page_id=?22, folder_id=?23,
             template_id=?24, updated_at=?25
             WHERE id=?1",
            params![
                page.id.to_string(), page.title, page.summary, page.emoji,
                page.research_stage, tags_json, page.word_count,
                page.is_pinned, page.is_archived, page.is_favorite, page.is_journal,
                page.is_locked, page.sort_order, page.journal_date,
                page.front_matter_data, page.ideas_data,
                page.needs_vault_sync, page.last_synced_body_hash, page.last_synced_at,
                page.file_path, page.subfolder,
                page.parent_page_id.map(|p| p.to_string()),
                page.folder_id.map(|f| f.to_string()),
                page.template_id, page.updated_at,
            ],
        )?;
        if affected == 0 {
            return Err(StorageError::PageNotFound(page.id));
        }
        Ok(())
    }

    pub fn delete_page(&self, id: PageId) -> Result<(), StorageError> {
        self.conn.execute("DELETE FROM page_bodies WHERE page_id = ?1", params![id.to_string()])?;
        self.conn.execute("DELETE FROM blocks WHERE page_id = ?1", params![id.to_string()])?;
        self.conn.execute("DELETE FROM page_versions WHERE page_id = ?1", params![id.to_string()])?;
        self.conn.execute("DELETE FROM pages WHERE id = ?1", params![id.to_string()])?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Page Bodies (separate from metadata)
    // ──────────────────────────────────────────────

    pub fn load_body(&self, page_id: PageId) -> Result<String, StorageError> {
        let body: Option<String> = self.conn
            .query_row(
                "SELECT body FROM page_bodies WHERE page_id = ?1",
                params![page_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        Ok(body.unwrap_or_default())
    }

    /// Get the stored entity extraction hash for a page.
    pub fn get_entity_hash(&self, page_id: PageId) -> Result<Option<String>, StorageError> {
        let hash: Option<Option<String>> = self.conn
            .query_row(
                "SELECT entity_hash FROM pages WHERE id = ?1",
                params![page_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        Ok(hash.flatten())
    }

    /// Update the entity extraction hash for a page.
    pub fn set_entity_hash(&self, page_id: PageId, hash: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE pages SET entity_hash = ?2 WHERE id = ?1",
            params![page_id.to_string(), hash],
        )?;
        Ok(())
    }

    /// Set the research stage for a page.
    pub fn set_research_stage(&self, page_id: PageId, stage: i32) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE pages SET research_stage = ?2, updated_at = ?3 WHERE id = ?1",
            params![page_id.to_string(), stage, now_ms()],
        )?;
        Ok(())
    }

    /// Update just the summary field on a page.
    pub fn set_page_summary(&self, page_id: PageId, summary: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE pages SET summary = ?2, updated_at = ?3 WHERE id = ?1",
            params![page_id.to_string(), summary, now_ms()],
        )?;
        Ok(())
    }

    pub fn save_body(&self, page_id: PageId, body: &str) -> Result<(), StorageError> {
        let now = now_ms();
        self.conn.execute(
            "INSERT INTO page_bodies (page_id, body, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(page_id) DO UPDATE SET body=?2, updated_at=?3",
            params![page_id.to_string(), body, now],
        )?;
        Ok(())
    }

    /// Update word count and updated_at for a page (called on body save).
    pub fn update_word_count(&self, page_id: PageId, word_count: i32) -> Result<(), StorageError> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE pages SET word_count=?2, updated_at=?3 WHERE id=?1",
            params![page_id.to_string(), word_count, now],
        )?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Blocks
    // ──────────────────────────────────────────────

    pub fn insert_block(&self, block: &Block) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO blocks (id, page_id, parent_block_id, \"order\", depth,
             content, is_collapsed, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                block.id.to_string(), block.page_id.to_string(),
                block.parent_block_id.map(|b| b.to_string()),
                block.order, block.depth, block.content, block.is_collapsed,
                block.created_at, block.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_blocks_for_page(&self, page_id: PageId) -> Result<Vec<Block>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, page_id, parent_block_id, \"order\", depth, content,
             is_collapsed, created_at, updated_at
             FROM blocks WHERE page_id = ?1 ORDER BY \"order\"",
        )?;
        let blocks = stmt
            .query_map(params![page_id.to_string()], row_to_block)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(blocks)
    }

    /// Get a single block by ID.
    pub fn get_block(&self, block_id: BlockId) -> Result<Block, StorageError> {
        self.conn
            .query_row(
                "SELECT id, page_id, parent_block_id, \"order\", depth, content,
                 is_collapsed, created_at, updated_at
                 FROM blocks WHERE id = ?1",
                params![block_id.to_string()],
                row_to_block,
            )
            .optional()?
            .ok_or(StorageError::BlockNotFound(block_id))
    }

    pub fn update_block(&self, block: &Block) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE blocks SET parent_block_id=?2, \"order\"=?3, depth=?4,
             content=?5, is_collapsed=?6, updated_at=?7 WHERE id=?1",
            params![
                block.id.to_string(),
                block.parent_block_id.map(|b| b.to_string()),
                block.order, block.depth, block.content,
                block.is_collapsed, block.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_blocks_for_page(&self, page_id: PageId) -> Result<(), StorageError> {
        self.conn.execute("DELETE FROM blocks WHERE page_id = ?1", params![page_id.to_string()])?;
        Ok(())
    }

    /// Delete a single block by ID.
    pub fn delete_block(&self, block_id: &str) -> Result<(), StorageError> {
        self.conn.execute("DELETE FROM blocks WHERE id = ?1", params![block_id])?;
        Ok(())
    }

    /// Update a block's content, depth, and order by ID.
    pub fn update_block_fields(
        &self,
        block_id: &str,
        content: &str,
        depth: i32,
        order: i32,
    ) -> Result<(), StorageError> {
        let now = now_ms();
        self.conn.execute(
            "UPDATE blocks SET content=?2, depth=?3, \"order\"=?4, updated_at=?5 WHERE id=?1",
            params![block_id, content, depth, order, now],
        )?;
        Ok(())
    }

    /// Set a block's parent_block_id.
    pub fn set_block_parent(
        &self,
        block_id: &str,
        parent_block_id: Option<&str>,
    ) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE blocks SET parent_block_id=?2 WHERE id=?1",
            params![block_id, parent_block_id],
        )?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Chats
    // ──────────────────────────────────────────────

    pub fn insert_chat(&self, chat: &Chat) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO chats (id, title, chat_type, page_context_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                chat.id.to_string(), chat.title, chat.chat_type,
                chat.page_context_id.map(|p| p.to_string()),
                chat.created_at, chat.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_chat(&self, id: ChatId) -> Result<Chat, StorageError> {
        self.conn
            .query_row(
                "SELECT id, title, chat_type, page_context_id, created_at, updated_at
                 FROM chats WHERE id = ?1",
                params![id.to_string()],
                row_to_chat,
            )
            .optional()?
            .ok_or_else(|| StorageError::ChatNotFound(id.to_string()))
    }

    pub fn list_chats(&self) -> Result<Vec<Chat>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, chat_type, page_context_id, created_at, updated_at
             FROM chats ORDER BY updated_at DESC",
        )?;
        let chats = stmt
            .query_map([], row_to_chat)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(chats)
    }

    pub fn delete_chat(&self, id: ChatId) -> Result<(), StorageError> {
        self.conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![id.to_string()])?;
        self.conn.execute("DELETE FROM chats WHERE id = ?1", params![id.to_string()])?;
        Ok(())
    }

    /// Update a chat's title (used by auto-title generation).
    pub fn update_chat_title(&self, id: ChatId, title: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE chats SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, crate::types::now_ms(), id.to_string()],
        )?;
        Ok(())
    }

    /// Search pages by title (case-insensitive substring match).
    /// Used for @-mention resolution in chat queries.
    pub fn search_pages_by_title(&self, title: &str) -> Result<Vec<Page>, StorageError> {
        // Escape LIKE wildcards in user input to prevent pattern injection
        let escaped = title.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        let mut stmt = self.conn.prepare(
            "SELECT id, title, summary, emoji, research_stage, tags_json,
             word_count, is_pinned, is_archived, is_favorite, is_journal,
             is_locked, sort_order, journal_date, front_matter_data, ideas_data,
             needs_vault_sync, last_synced_body_hash, last_synced_at,
             file_path, subfolder, parent_page_id, folder_id, template_id,
             created_at, updated_at
             FROM pages WHERE title LIKE ?1 ESCAPE '\\' COLLATE NOCASE ORDER BY updated_at DESC LIMIT 10",
        )?;
        let pages = stmt
            .query_map(params![pattern], row_to_page)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(pages)
    }

    // ──────────────────────────────────────────────
    // Messages
    // ──────────────────────────────────────────────

    pub fn insert_message(&self, msg: &Message) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO messages (id, chat_id, role, content, dual_message_data,
             truth_assessment_data, confidence_score, evidence_grade, inference_mode,
             is_streaming, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                msg.id.to_string(), msg.chat_id.to_string(), msg.role, msg.content,
                msg.dual_message_data, msg.truth_assessment_data,
                msg.confidence_score, msg.evidence_grade, msg.inference_mode,
                msg.is_streaming, msg.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_messages_for_chat(&self, chat_id: ChatId) -> Result<Vec<Message>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, chat_id, role, content, dual_message_data,
             truth_assessment_data, confidence_score, evidence_grade,
             inference_mode, is_streaming, created_at
             FROM messages WHERE chat_id = ?1 ORDER BY created_at",
        )?;
        let msgs = stmt
            .query_map(params![chat_id.to_string()], row_to_message)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(msgs)
    }

    /// Update the dual_message_data on the most recent assistant message in a chat.
    pub fn update_message_dual_data(&self, chat_id: ChatId, data: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE messages SET dual_message_data = ?1
             WHERE id = (
                SELECT id FROM messages
                WHERE chat_id = ?2 AND role = 'assistant'
                ORDER BY created_at DESC LIMIT 1
             )",
            params![data, chat_id.to_string()],
        )?;
        Ok(())
    }

    /// Update enrichment metadata on the most recent assistant message.
    /// Sets dual_message_data, truth_assessment_data, confidence_score, and evidence_grade.
    pub fn update_message_enrichment(
        &self,
        chat_id: ChatId,
        dual_data: &str,
        truth_data: &str,
        confidence: f64,
        grade: &str,
    ) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE messages SET dual_message_data = ?1, truth_assessment_data = ?2,
             confidence_score = ?3, evidence_grade = ?4
             WHERE id = (
                SELECT id FROM messages
                WHERE chat_id = ?5 AND role = 'assistant'
                ORDER BY created_at DESC LIMIT 1
             )",
            params![dual_data, truth_data, confidence, grade, chat_id.to_string()],
        )?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Graph Nodes
    // ──────────────────────────────────────────────

    pub fn insert_graph_node(&self, node: &GraphNode) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO graph_nodes (id, node_type, label, source_id, weight,
             metadata_json, is_manual, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                node.id.to_string(), node.node_type.to_i32(), node.label,
                node.source_id, node.weight, node.metadata_json,
                node.is_manual, node.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn insert_graph_nodes_batch(&self, nodes: &[GraphNode]) -> Result<(), StorageError> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO graph_nodes (id, node_type, label, source_id, weight,
                 metadata_json, is_manual, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            )?;
            for node in nodes {
                stmt.execute(params![
                    node.id.to_string(), node.node_type.to_i32(), node.label,
                    node.source_id, node.weight, node.metadata_json,
                    node.is_manual, node.created_at,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_all_graph_nodes(&self) -> Result<Vec<GraphNode>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, node_type, label, source_id, weight, metadata_json,
             is_manual, created_at FROM graph_nodes",
        )?;
        let nodes = stmt
            .query_map([], row_to_graph_node)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(nodes)
    }

    pub fn delete_auto_graph_nodes(&self) -> Result<u64, StorageError> {
        let count = self.conn.execute("DELETE FROM graph_nodes WHERE is_manual = 0", [])?;
        Ok(count as u64)
    }

    // ──────────────────────────────────────────────
    // Graph Edges
    // ──────────────────────────────────────────────

    pub fn insert_graph_edge(&self, edge: &GraphEdge) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO graph_edges (id, source_node_id, target_node_id, edge_type,
             weight, metadata_json, is_manual, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                edge.id.to_string(), edge.source_node_id.to_string(),
                edge.target_node_id.to_string(), edge.edge_type.to_i32(),
                edge.weight, edge.metadata_json, edge.is_manual, edge.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn insert_graph_edges_batch(&self, edges: &[GraphEdge]) -> Result<(), StorageError> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO graph_edges (id, source_node_id, target_node_id,
                 edge_type, weight, metadata_json, is_manual, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            )?;
            for edge in edges {
                stmt.execute(params![
                    edge.id.to_string(), edge.source_node_id.to_string(),
                    edge.target_node_id.to_string(), edge.edge_type.to_i32(),
                    edge.weight, edge.metadata_json, edge.is_manual, edge.created_at,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_all_graph_edges(&self) -> Result<Vec<GraphEdge>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_node_id, target_node_id, edge_type, weight,
             metadata_json, is_manual, created_at FROM graph_edges",
        )?;
        let edges = stmt
            .query_map([], row_to_graph_edge)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(edges)
    }

    pub fn delete_auto_graph_edges(&self) -> Result<u64, StorageError> {
        let count = self.conn.execute("DELETE FROM graph_edges WHERE is_manual = 0", [])?;
        Ok(count as u64)
    }

    // ──────────────────────────────────────────────
    // Folders
    // ──────────────────────────────────────────────

    pub fn insert_folder(&self, folder: &Folder) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO folders (id, name, emoji, sort_order, is_collection, parent_folder_id, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                folder.id.to_string(), folder.name, folder.emoji,
                folder.sort_order, folder.is_collection,
                folder.parent_folder_id.map(|f| f.to_string()),
                folder.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_folder(&self, id: FolderId) -> Result<Folder, StorageError> {
        self.conn
            .query_row(
                "SELECT id, name, emoji, sort_order, is_collection, parent_folder_id, created_at
                 FROM folders WHERE id = ?1",
                params![id.to_string()],
                row_to_folder,
            )
            .optional()?
            .ok_or_else(|| StorageError::FolderNotFound(id.to_string()))
    }

    pub fn list_folders(&self) -> Result<Vec<Folder>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, emoji, sort_order, is_collection, parent_folder_id, created_at
             FROM folders ORDER BY sort_order, name",
        )?;
        let folders = stmt
            .query_map([], row_to_folder)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(folders)
    }

    pub fn update_folder(&self, folder: &Folder) -> Result<(), StorageError> {
        self.conn.execute(
            "UPDATE folders SET name=?2, emoji=?3, sort_order=?4, is_collection=?5,
             parent_folder_id=?6 WHERE id=?1",
            params![
                folder.id.to_string(), folder.name, folder.emoji,
                folder.sort_order, folder.is_collection,
                folder.parent_folder_id.map(|f| f.to_string()),
            ],
        )?;
        Ok(())
    }

    pub fn delete_folder(&self, id: FolderId) -> Result<(), StorageError> {
        // Orphan pages to root (nullify folder_id, same as macOS behavior)
        self.conn.execute(
            "UPDATE pages SET folder_id = NULL WHERE folder_id = ?1",
            params![id.to_string()],
        )?;
        // Delete child folders (cascade)
        self.conn.execute(
            "DELETE FROM folders WHERE parent_folder_id = ?1",
            params![id.to_string()],
        )?;
        self.conn.execute("DELETE FROM folders WHERE id = ?1", params![id.to_string()])?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Page Versions (content-addressable history)
    // ──────────────────────────────────────────────

    /// Save a new version snapshot for a page.
    pub fn save_page_version(&self, version: &PageVersion) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO page_versions (id, page_id, title, body, hash, parent_hash, timestamp, word_count, changes_summary)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                version.id,
                version.page_id.to_string(),
                version.title,
                version.body,
                version.hash,
                version.parent_hash,
                version.timestamp,
                version.word_count,
                version.changes_summary,
            ],
        )?;
        Ok(())
    }

    /// Get all versions for a page, ordered by timestamp descending (newest first).
    pub fn get_page_versions(&self, page_id: PageId) -> Result<Vec<PageVersion>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, page_id, title, body, hash, parent_hash, timestamp, word_count, changes_summary
             FROM page_versions WHERE page_id = ?1 ORDER BY timestamp DESC",
        )?;
        let versions = stmt
            .query_map(params![page_id.to_string()], row_to_page_version)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(versions)
    }

    /// Get a specific version by ID.
    pub fn get_version(&self, version_id: &str) -> Result<PageVersion, StorageError> {
        self.conn
            .query_row(
                "SELECT id, page_id, title, body, hash, parent_hash, timestamp, word_count, changes_summary
                 FROM page_versions WHERE id = ?1",
                params![version_id],
                row_to_page_version,
            )
            .optional()?
            .ok_or_else(|| StorageError::VersionNotFound(version_id.to_string()))
    }

    /// Restore a page to a specific version.
    /// Returns the version data that was restored.
    pub fn restore_version(&self, version_id: &str) -> Result<PageVersion, StorageError> {
        let version = self.get_version(version_id)?;

        // Update page body
        self.conn.execute(
            "INSERT INTO page_bodies (page_id, body, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(page_id) DO UPDATE SET body=?2, updated_at=?3",
            params![version.page_id.to_string(), version.body, now_ms()],
        )?;

        // Update page metadata (title, word_count)
        self.conn.execute(
            "UPDATE pages SET title=?2, word_count=?3, updated_at=?4 WHERE id=?1",
            params![
                version.page_id.to_string(),
                version.title,
                version.word_count,
                now_ms(),
            ],
        )?;

        Ok(version)
    }

    /// Get the count of versions for a page.
    pub fn get_page_version_count(&self, page_id: PageId) -> Result<i64, StorageError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM page_versions WHERE page_id = ?1",
            params![page_id.to_string()],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Delete the oldest versions for a page to keep under a max count.
    pub fn prune_old_versions(&self, page_id: PageId, keep_count: usize) -> Result<usize, StorageError> {
        let count = self.conn.execute(
            "DELETE FROM page_versions WHERE page_id = ?1 AND id IN (
                SELECT id FROM page_versions WHERE page_id = ?1
                ORDER BY timestamp ASC LIMIT -1 OFFSET ?2
            )",
            params![page_id.to_string(), keep_count as i64],
        )?;
        Ok(count)
    }

    pub fn delete_version(&self, version_id: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "DELETE FROM page_versions WHERE id = ?1",
            params![version_id],
        )?;
        Ok(())
    }

    pub fn delete_versions_for_page(&self, page_id: PageId) -> Result<(), StorageError> {
        self.conn.execute(
            "DELETE FROM page_versions WHERE page_id = ?1",
            params![page_id.to_string()],
        )?;
        Ok(())
    }

    /// Get the most recent version for a page, if any exists.
    pub fn get_latest_version(&self, page_id: PageId) -> Result<Option<PageVersion>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, page_id, title, body, hash, parent_hash, timestamp, word_count, changes_summary
             FROM page_versions WHERE page_id = ?1 ORDER BY timestamp DESC LIMIT 1",
        )?;
        let version = stmt
            .query_map(params![page_id.to_string()], row_to_page_version)?
            .next()
            .transpose()?;
        Ok(version)
    }

    // ──────────────────────────────────────────────
    // Settings (KV store)
    // ──────────────────────────────────────────────

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, StorageError> {
        let val = self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(val)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=?2",
            params![key, value],
        )?;
        Ok(())
    }

    // ──────────────────────────────────────────────
    // Full-Text Search (FTS5 + BM25)
    // ──────────────────────────────────────────────

    /// Insert or update the FTS5 search index for a page.
    pub fn upsert_search_index(
        &self,
        page_id: PageId,
        title: &str,
        body: &str,
        tags: &str,
    ) -> Result<(), StorageError> {
        let pid = page_id.to_string();
        // Delete old entry if it exists
        self.conn.execute(
            "DELETE FROM search_index WHERE page_id = ?1",
            params![pid],
        )?;
        // Insert fresh entry
        self.conn.execute(
            "INSERT INTO search_index (page_id, title, body, tags) VALUES (?1, ?2, ?3, ?4)",
            params![pid, title, body, tags],
        )?;
        Ok(())
    }

    /// Remove a page from the FTS5 search index.
    pub fn delete_search_index(&self, page_id: PageId) -> Result<(), StorageError> {
        self.conn.execute(
            "DELETE FROM search_index WHERE page_id = ?1",
            params![page_id.to_string()],
        )?;
        Ok(())
    }

    /// Full-text search across pages using FTS5 + BM25 ranking.
    ///
    /// BM25 weights: title=5x, body=1x, tags=2x.
    /// Returns results sorted by relevance (best first).
    pub fn search_fts5(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>, StorageError> {
        let sanitized = sanitize_fts5_query(query);
        if sanitized.is_empty() {
            return Ok(Vec::new());
        }

        let mut stmt = self.conn.prepare(
            "SELECT
                si.page_id,
                si.title,
                snippet(search_index, 2, '<b>', '</b>', '…', 32) AS snippet,
                bm25(search_index, 0.0, 5.0, 1.0, 2.0) AS rank
             FROM search_index si
             WHERE search_index MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )?;

        let results = stmt
            .query_map(params![sanitized, limit as i64], |row| {
                let pid: String = row.get(0)?;
                Ok(SearchResult {
                    page_id: parse_id(&pid)?,
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                    score: row.get::<_, f64>(3)?.abs(), // BM25 returns negative (lower = better)
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Rebuild the entire FTS5 index from current pages + bodies.
    /// Wrapped in a single transaction for 10-100x faster bulk writes.
    pub fn rebuild_search_index(&self) -> Result<usize, StorageError> {
        // Phase 1: Read all data (before transaction borrows conn)
        let pages = self.list_pages()?;
        let mut entries = Vec::with_capacity(pages.len());
        for page in &pages {
            if page.is_archived {
                continue;
            }
            let body = self.load_body(page.id)?;
            let tags = page.tags.join(", ");
            entries.push((page.id.to_string(), page.title.clone(), body, tags));
        }

        // Phase 2: Batch write in single transaction (avoids per-row fsync)
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM search_index", [])?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO search_index (page_id, title, body, tags) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (pid, title, body, tags) in &entries {
                stmt.execute(params![pid, title, body, tags])?;
            }
        }
        tx.commit()?;

        Ok(entries.len())
    }
}

// ──────────────────────────────────────────────
// FTS5 query sanitizer
// ──────────────────────────────────────────────

/// Sanitize user input for FTS5 MATCH query.
///
/// Splits on non-alphanumeric characters, drops short tokens (<2 chars),
/// removes quotes, and joins as prefix search terms: `"word1"* "word2"*`.
fn sanitize_fts5_query(query: &str) -> String {
    let tokens: Vec<&str> = query
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|w| w.len() >= 2)
        .collect();

    if tokens.is_empty() {
        return String::new();
    }

    tokens
        .iter()
        .map(|t| format!("\"{}\"*", t.to_lowercase()))
        .collect::<Vec<_>>()
        .join(" ")
}

// ──────────────────────────────────────────────
// Row → struct mappers
// ──────────────────────────────────────────────

/// Parse a string column into a typed ID, converting parse errors into
/// rusqlite errors so they propagate through query_map instead of panicking.
fn parse_id<T: std::str::FromStr>(s: &str) -> Result<T, rusqlite::Error>
where
    T::Err: std::error::Error + Send + Sync + 'static,
{
    s.parse().map_err(|e: T::Err| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    })
}

/// Convert a database row to a Page struct.
pub fn row_to_page(row: &rusqlite::Row<'_>) -> Result<Page, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let tags_json: String = row.get(5)?;
    let parent_str: Option<String> = row.get(21)?;
    let folder_str: Option<String> = row.get(22)?;
    Ok(Page {
        id: parse_id(&id_str)?,
        title: row.get(1)?,
        summary: row.get(2)?,
        emoji: row.get(3)?,
        research_stage: row.get(4)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        word_count: row.get(6)?,
        is_pinned: row.get(7)?,
        is_archived: row.get(8)?,
        is_favorite: row.get(9)?,
        is_journal: row.get(10)?,
        is_locked: row.get(11)?,
        sort_order: row.get(12)?,
        journal_date: row.get(13)?,
        front_matter_data: row.get(14)?,
        ideas_data: row.get(15)?,
        needs_vault_sync: row.get(16)?,
        last_synced_body_hash: row.get(17)?,
        last_synced_at: row.get(18)?,
        file_path: row.get(19)?,
        subfolder: row.get(20)?,
        parent_page_id: parent_str.and_then(|s| s.parse().ok()),
        folder_id: folder_str.and_then(|s| s.parse().ok()),
        template_id: row.get(23)?,
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
    })
}

fn row_to_folder(row: &rusqlite::Row<'_>) -> Result<Folder, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let parent_str: Option<String> = row.get(5)?;
    Ok(Folder {
        id: parse_id(&id_str)?,
        name: row.get(1)?,
        emoji: row.get(2)?,
        sort_order: row.get(3)?,
        is_collection: row.get(4)?,
        parent_folder_id: parent_str.and_then(|s| s.parse().ok()),
        created_at: row.get(6)?,
    })
}

fn row_to_page_version(row: &rusqlite::Row<'_>) -> Result<PageVersion, rusqlite::Error> {
    let page_str: String = row.get(1)?;
    Ok(PageVersion {
        id: row.get(0)?,
        page_id: parse_id(&page_str)?,
        title: row.get(2)?,
        body: row.get(3)?,
        hash: row.get(4)?,
        parent_hash: row.get(5)?,
        timestamp: row.get(6)?,
        word_count: row.get(7)?,
        changes_summary: row.get(8)?,
    })
}

fn row_to_block(row: &rusqlite::Row<'_>) -> Result<Block, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let page_str: String = row.get(1)?;
    let parent_str: Option<String> = row.get(2)?;
    Ok(Block {
        id: parse_id(&id_str)?,
        page_id: parse_id(&page_str)?,
        parent_block_id: parent_str.and_then(|s| s.parse().ok()),
        order: row.get(3)?,
        depth: row.get(4)?,
        content: row.get(5)?,
        is_collapsed: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn row_to_chat(row: &rusqlite::Row<'_>) -> Result<Chat, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let ctx_str: Option<String> = row.get(3)?;
    Ok(Chat {
        id: parse_id(&id_str)?,
        title: row.get(1)?,
        chat_type: row.get(2)?,
        page_context_id: ctx_str.and_then(|s| s.parse().ok()),
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn row_to_message(row: &rusqlite::Row<'_>) -> Result<Message, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let chat_str: String = row.get(1)?;
    Ok(Message {
        id: parse_id(&id_str)?,
        chat_id: parse_id(&chat_str)?,
        role: row.get(2)?,
        content: row.get(3)?,
        dual_message_data: row.get(4)?,
        truth_assessment_data: row.get(5)?,
        confidence_score: row.get(6)?,
        evidence_grade: row.get(7)?,
        inference_mode: row.get(8)?,
        is_streaming: row.get(9)?,
        created_at: row.get(10)?,
    })
}

fn row_to_graph_node(row: &rusqlite::Row<'_>) -> Result<GraphNode, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let type_int: i32 = row.get(1)?;
    Ok(GraphNode {
        id: parse_id(&id_str)?,
        node_type: GraphNodeType::from_i32(type_int),
        label: row.get(2)?,
        source_id: row.get(3)?,
        weight: row.get(4)?,
        metadata_json: row.get(5)?,
        is_manual: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn row_to_graph_edge(row: &rusqlite::Row<'_>) -> Result<GraphEdge, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let src_str: String = row.get(1)?;
    let tgt_str: String = row.get(2)?;
    let type_int: i32 = row.get(3)?;
    Ok(GraphEdge {
        id: parse_id(&id_str)?,
        source_node_id: parse_id(&src_str)?,
        target_node_id: parse_id(&tgt_str)?,
        edge_type: GraphEdgeType::from_i32(type_int),
        weight: row.get(4)?,
        metadata_json: row.get(5)?,
        is_manual: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn row_to_transclusion(row: &rusqlite::Row<'_>) -> Result<Transclusion, rusqlite::Error> {
    let id_str: String = row.get(0)?;
    let source_str: String = row.get(1)?;
    let target_str: String = row.get(2)?;
    let target_block_str: Option<String> = row.get(3)?;
    Ok(Transclusion {
        id: parse_id(&id_str)?,
        source_page_id: parse_id(&source_str)?,
        target_page_id: parse_id(&target_str)?,
        target_block_id: target_block_str.and_then(|s| s.parse().ok()),
        created_at: row.get(4)?,
    })
}

/// Parse a page row starting at a given offset (for JOIN queries).
fn row_to_page_offset(row: &rusqlite::Row<'_>, offset: usize) -> Result<Page, rusqlite::Error> {
    let id_str: String = row.get(offset)?;
    let tags_json: String = row.get(offset + 5)?;
    let parent_str: Option<String> = row.get(offset + 21)?;
    let folder_str: Option<String> = row.get(offset + 22)?;
    Ok(Page {
        id: parse_id(&id_str)?,
        title: row.get(offset + 1)?,
        summary: row.get(offset + 2)?,
        emoji: row.get(offset + 3)?,
        research_stage: row.get(offset + 4)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        word_count: row.get(offset + 6)?,
        is_pinned: row.get(offset + 7)?,
        is_archived: row.get(offset + 8)?,
        is_favorite: row.get(offset + 9)?,
        is_journal: row.get(offset + 10)?,
        is_locked: row.get(offset + 11)?,
        sort_order: row.get(offset + 12)?,
        journal_date: row.get(offset + 13)?,
        front_matter_data: row.get(offset + 14)?,
        ideas_data: row.get(offset + 15)?,
        needs_vault_sync: row.get(offset + 16)?,
        last_synced_body_hash: row.get(offset + 17)?,
        last_synced_at: row.get(offset + 18)?,
        file_path: row.get(offset + 19)?,
        subfolder: row.get(offset + 20)?,
        parent_page_id: parent_str.and_then(|s| s.parse().ok()),
        folder_id: folder_str.and_then(|s| s.parse().ok()),
        template_id: row.get(offset + 23)?,
        created_at: row.get(offset + 24)?,
        updated_at: row.get(offset + 25)?,
    })
}

// ──────────────────────────────────────────────
// Transclusions
// ──────────────────────────────────────────────

impl Database {
    /// Create a new transclusion (block reference).
    /// Returns the created transclusion with generated ID.
    pub fn create_transclusion(
        &self,
        source_page_id: PageId,
        target_page_id: PageId,
        target_block_id: Option<BlockId>,
    ) -> Result<Transclusion, StorageError> {
        let transclusion = Transclusion::new(source_page_id, target_page_id, target_block_id);
        self.conn.execute(
            "INSERT INTO transclusions (id, source_page_id, target_page_id, target_block_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                transclusion.id.to_string(),
                transclusion.source_page_id.to_string(),
                transclusion.target_page_id.to_string(),
                opt_block_id_to_string(transclusion.target_block_id),
                transclusion.created_at,
            ],
        )?;
        Ok(transclusion)
    }

    /// Get a transclusion by ID.
    pub fn get_transclusion(&self, id: TransclusionId) -> Result<Transclusion, StorageError> {
        self.conn
            .query_row(
                "SELECT id, source_page_id, target_page_id, target_block_id, created_at
                 FROM transclusions WHERE id = ?1",
                params![id.to_string()],
                row_to_transclusion,
            )
            .optional()?
            .ok_or(StorageError::TransclusionNotFound(id))
    }

    /// Get all transclusions where the given page is the source
    /// (i.e., all blocks this page has transcluded from elsewhere).
    pub fn get_transclusions_for_page(&self, page_id: PageId) -> Result<Vec<Transclusion>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_page_id, target_page_id, target_block_id, created_at
             FROM transclusions WHERE source_page_id = ?1 ORDER BY created_at DESC",
        )?;
        let transclusions = stmt
            .query_map(params![page_id.to_string()], row_to_transclusion)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(transclusions)
    }

    /// Get all transclusions that reference a specific block.
    /// Used when a block is updated to know which transclusions need refresh.
    pub fn get_transclusions_for_block(&self, block_id: BlockId) -> Result<Vec<Transclusion>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_page_id, target_page_id, target_block_id, created_at
             FROM transclusions WHERE target_block_id = ?1 ORDER BY created_at DESC",
        )?;
        let transclusions = stmt
            .query_map(params![block_id.to_string()], row_to_transclusion)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(transclusions)
    }

    /// Get all pages that transclude content from a specific block.
    /// Returns page IDs that would need updating when this block changes.
    pub fn get_pages_transcluding_block(&self, block_id: BlockId) -> Result<Vec<PageId>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT source_page_id FROM transclusions WHERE target_block_id = ?1",
        )?;
        let pages = stmt
            .query_map(params![block_id.to_string()], |row| {
                let s: String = row.get(0)?;
                parse_id(&s)
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(pages)
    }

    /// Get all pages that transclude any block from a specific page.
    pub fn get_pages_transcluding_page(&self, page_id: PageId) -> Result<Vec<PageId>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT source_page_id FROM transclusions WHERE target_page_id = ?1",
        )?;
        let pages = stmt
            .query_map(params![page_id.to_string()], |row| {
                let s: String = row.get(0)?;
                parse_id(&s)
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(pages)
    }

    /// Delete a transclusion by ID.
    pub fn delete_transclusion(&self, id: TransclusionId) -> Result<(), StorageError> {
        let affected = self.conn.execute(
            "DELETE FROM transclusions WHERE id = ?1",
            params![id.to_string()],
        )?;
        if affected == 0 {
            return Err(StorageError::TransclusionNotFound(id));
        }
        Ok(())
    }

    /// Delete all transclusions for a page (used when page is deleted).
    pub fn delete_transclusions_for_page(&self, page_id: PageId) -> Result<(), StorageError> {
        self.conn.execute(
            "DELETE FROM transclusions WHERE source_page_id = ?1 OR target_page_id = ?1",
            params![page_id.to_string(), page_id.to_string()],
        )?;
        Ok(())
    }

    /// Check if creating a transclusion would create a circular reference.
    /// Returns true if target_page (or any of its transclusions) transcludes source_page.
    pub fn would_create_circular_transclusion(
        &self,
        source_page_id: PageId,
        target_page_id: PageId,
    ) -> Result<bool, StorageError> {
        // Direct self-reference
        if source_page_id == target_page_id {
            return Ok(true);
        }

        // BFS to check if target_page eventually transcludes source_page
        let mut visited = std::collections::HashSet::new();
        let mut queue = vec![target_page_id];

        while let Some(current) = queue.pop() {
            if !visited.insert(current) {
                continue;
            }

            // Get all pages that this page transcludes
            let mut stmt = self.conn.prepare(
                "SELECT DISTINCT target_page_id FROM transclusions WHERE source_page_id = ?1"
            )?;
            let targets: Vec<PageId> = stmt
                .query_map(params![current.to_string()], |row| {
                    let s: String = row.get(0)?;
                    parse_id(&s)
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for target in targets {
                if target == source_page_id {
                    return Ok(true); // Found circular reference
                }
                if !visited.contains(&target) {
                    queue.push(target);
                }
            }
        }

        Ok(false)
    }

    /// Search blocks across all pages for the transclusion autocomplete.
    /// Returns blocks with content matching the query.
    pub fn search_blocks_for_transclusion(&self, query: &str, limit: usize) -> Result<Vec<(Block, Page)>, StorageError> {
        let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let mut stmt = self.conn.prepare(
            "SELECT b.id, b.page_id, b.parent_block_id, b.\"order\", b.depth, b.content,
             b.is_collapsed, b.created_at, b.updated_at,
             p.id, p.title, p.summary, p.emoji, p.research_stage, p.tags_json,
             p.word_count, p.is_pinned, p.is_archived, p.is_favorite, p.is_journal,
             p.is_locked, p.sort_order, p.journal_date, p.front_matter_data, p.ideas_data,
             p.needs_vault_sync, p.last_synced_body_hash, p.last_synced_at,
             p.file_path, p.subfolder, p.parent_page_id, p.folder_id, p.template_id,
             p.created_at, p.updated_at
             FROM blocks b
             JOIN pages p ON b.page_id = p.id
             WHERE b.content LIKE ?1 ESCAPE '\\'
             ORDER BY b.updated_at DESC
             LIMIT ?2"
        )?;

        let results = stmt
            .query_map(params![pattern, limit as i64], |row| {
                let block = row_to_block(row)?;
                // Shift row index by 9 for page fields
                let page = row_to_page_offset(row, 9)?;
                Ok((block, page))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Search blocks for block reference autocomplete.
    /// Triggered by typing `((` in the block editor.
    /// Returns blocks with fuzzy search on content, ranked by relevance.
    pub fn search_blocks(&self, query: &str, limit: usize) -> Result<Vec<(Block, Page)>, StorageError> {
        // Escape LIKE wildcards for security
        let escaped = query.replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{}%", escaped);
        
        // Use FTS5 for better search if available, fallback to LIKE
        // For now using LIKE with content matching - can be enhanced with FTS5 later
        let mut stmt = self.conn.prepare(
            "SELECT b.id, b.page_id, b.parent_block_id, b.\"order\", b.depth, b.content,
             b.is_collapsed, b.created_at, b.updated_at,
             p.id, p.title, p.summary, p.emoji, p.research_stage, p.tags_json,
             p.word_count, p.is_pinned, p.is_archived, p.is_favorite, p.is_journal,
             p.is_locked, p.sort_order, p.journal_date, p.front_matter_data, p.ideas_data,
             p.needs_vault_sync, p.last_synced_body_hash, p.last_synced_at,
             p.file_path, p.subfolder, p.parent_page_id, p.folder_id, p.template_id,
             p.created_at, p.updated_at
             FROM blocks b
             JOIN pages p ON b.page_id = p.id
             WHERE b.content LIKE ?1 ESCAPE '\\'
             ORDER BY 
                 CASE 
                     WHEN LOWER(b.content) LIKE LOWER(?2) THEN 1
                     WHEN LOWER(p.title) LIKE LOWER(?2) THEN 2
                     ELSE 3
                 END,
                 b.updated_at DESC
             LIMIT ?3"
        )?;

        let exact_pattern = format!("%{}%", query.to_lowercase());
        
        let results = stmt
            .query_map(params![pattern, exact_pattern, limit as i64], |row| {
                let block = row_to_block(row)?;
                // Shift row index by 9 for page fields
                let page = row_to_page_offset(row, 9)?;
                Ok((block, page))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }
}

// ──────────────────────────────────────────────
// Schema SQL
// ──────────────────────────────────────────────

const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    emoji TEXT,
    research_stage INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    word_count INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_journal INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    journal_date TEXT,
    front_matter_data TEXT,
    ideas_data TEXT,
    needs_vault_sync INTEGER NOT NULL DEFAULT 0,
    last_synced_body_hash TEXT,
    last_synced_at INTEGER,
    file_path TEXT,
    subfolder TEXT,
    parent_page_id TEXT,
    folder_id TEXT,
    template_id TEXT,
    entity_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS page_bodies (
    page_id TEXT PRIMARY KEY,
    body TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    parent_block_id TEXT,
    [order] INTEGER NOT NULL DEFAULT 0,
    depth INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    is_collapsed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    chat_type TEXT NOT NULL DEFAULT 'general',
    page_context_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    dual_message_data TEXT,
    truth_assessment_data TEXT,
    confidence_score REAL,
    evidence_grade TEXT,
    inference_mode TEXT,
    is_streaming INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    node_type INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 1.0,
    metadata_json TEXT,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    edge_type INTEGER NOT NULL DEFAULT 0,
    weight REAL NOT NULL DEFAULT 1.0,
    metadata_json TEXT,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    emoji TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_collection INTEGER NOT NULL DEFAULT 0,
    parent_folder_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS page_versions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    hash TEXT NOT NULL,
    parent_hash TEXT,
    timestamp INTEGER NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    changes_summary TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transclusions (
    id TEXT PRIMARY KEY,
    source_page_id TEXT NOT NULL,
    target_page_id TEXT NOT NULL,
    target_block_id TEXT,
    created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blocks_page_id ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_blocks_parent ON blocks(parent_block_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_source ON graph_nodes(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id);
CREATE INDEX IF NOT EXISTS idx_transclusions_source ON transclusions(source_page_id);
CREATE INDEX IF NOT EXISTS idx_transclusions_target_page ON transclusions(target_page_id);
CREATE INDEX IF NOT EXISTS idx_transclusions_target_block ON transclusions(target_block_id);

-- FTS5 for full-text search — BM25-ranked, Unicode tokenizer
-- Weights: title=5x, body=1x, tags=2x (applied in BM25 query)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    page_id UNINDEXED,
    title,
    body,
    tags,
    tokenize='unicode61'
);

-- Auto-sync FTS5 when page bodies change (Logseq-inspired write-through pattern)
CREATE TRIGGER IF NOT EXISTS trg_fts_body_insert AFTER INSERT ON page_bodies
BEGIN
    DELETE FROM search_index WHERE page_id = NEW.page_id;
    INSERT INTO search_index (page_id, title, body, tags)
    SELECT NEW.page_id, p.title, NEW.body, p.tags_json
    FROM pages p WHERE p.id = NEW.page_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_fts_body_update AFTER UPDATE ON page_bodies
BEGIN
    DELETE FROM search_index WHERE page_id = NEW.page_id;
    INSERT INTO search_index (page_id, title, body, tags)
    SELECT NEW.page_id, p.title, NEW.body, p.tags_json
    FROM pages p WHERE p.id = NEW.page_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_fts_body_delete AFTER DELETE ON page_bodies
BEGIN
    DELETE FROM search_index WHERE page_id = OLD.page_id;
END;

-- Auto-sync FTS5 when page title or tags change
CREATE TRIGGER IF NOT EXISTS trg_fts_page_update AFTER UPDATE OF title, tags_json ON pages
BEGIN
    DELETE FROM search_index WHERE page_id = NEW.id;
    INSERT INTO search_index (page_id, title, body, tags)
    SELECT NEW.id, NEW.title, pb.body, NEW.tags_json
    FROM page_bodies pb WHERE pb.page_id = NEW.id;
END;
";
