use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

use crate::error::StorageError;
use crate::ids::*;
use crate::types::*;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
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
                |row| Ok(row_to_page(row)),
            )
            .optional()?
            .ok_or(StorageError::PageNotFound(id))
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
            .query_map([], |row| Ok(row_to_page(row)))?
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
            .query_map(params![page_id.to_string()], |row| Ok(row_to_block(row)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(blocks)
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
                |row| Ok(row_to_chat(row)),
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
            .query_map([], |row| Ok(row_to_chat(row)))?
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
            .query_map(params![pattern], |row| Ok(row_to_page(row)))?
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
            .query_map(params![chat_id.to_string()], |row| Ok(row_to_message(row)))?
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
            .query_map([], |row| Ok(row_to_graph_node(row)))?
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
             weight, is_manual, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                edge.id.to_string(), edge.source_node_id.to_string(),
                edge.target_node_id.to_string(), edge.edge_type.to_i32(),
                edge.weight, edge.is_manual, edge.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn insert_graph_edges_batch(&self, edges: &[GraphEdge]) -> Result<(), StorageError> {
        let tx = self.conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO graph_edges (id, source_node_id, target_node_id,
                 edge_type, weight, is_manual, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            )?;
            for edge in edges {
                stmt.execute(params![
                    edge.id.to_string(), edge.source_node_id.to_string(),
                    edge.target_node_id.to_string(), edge.edge_type.to_i32(),
                    edge.weight, edge.is_manual, edge.created_at,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_all_graph_edges(&self) -> Result<Vec<GraphEdge>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_node_id, target_node_id, edge_type, weight,
             is_manual, created_at FROM graph_edges",
        )?;
        let edges = stmt
            .query_map([], |row| Ok(row_to_graph_edge(row)))?
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
                |row| Ok(row_to_folder(row)),
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
            .query_map([], |row| Ok(row_to_folder(row)))?
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

    pub fn insert_version(&self, version: &PageVersion) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT INTO page_versions (id, page_id, hash, parent_hash, timestamp, changes_summary)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                version.id, version.page_id.to_string(), version.hash,
                version.parent_hash, version.timestamp, version.changes_summary,
            ],
        )?;
        Ok(())
    }

    pub fn get_versions_for_page(&self, page_id: PageId) -> Result<Vec<PageVersion>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, page_id, hash, parent_hash, timestamp, changes_summary
             FROM page_versions WHERE page_id = ?1 ORDER BY timestamp DESC",
        )?;
        let versions = stmt
            .query_map(params![page_id.to_string()], |row| Ok(row_to_page_version(row)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(versions)
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
                    page_id: pid.parse().expect("valid page id in search index"),
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                    score: row.get::<_, f64>(3)?.abs(), // BM25 returns negative (lower = better)
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Rebuild the entire FTS5 index from current pages + bodies.
    pub fn rebuild_search_index(&self) -> Result<usize, StorageError> {
        // Clear existing index
        self.conn.execute("DELETE FROM search_index", [])?;

        // Load all pages and their bodies
        let pages = self.list_pages()?;
        let mut count = 0;
        for page in &pages {
            if page.is_archived {
                continue;
            }
            let body = self.load_body(page.id)?;
            let tags = page.tags.join(", ");
            self.upsert_search_index(page.id, &page.title, &body, &tags)?;
            count += 1;
        }
        Ok(count)
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

fn row_to_page(row: &rusqlite::Row<'_>) -> Page {
    let id_str: String = row.get_unwrap(0);
    let tags_json: String = row.get_unwrap(5);
    let parent_str: Option<String> = row.get_unwrap(21);
    let folder_str: Option<String> = row.get_unwrap(22);
    Page {
        id: id_str.parse().expect("valid page id in db"),
        title: row.get_unwrap(1),
        summary: row.get_unwrap(2),
        emoji: row.get_unwrap(3),
        research_stage: row.get_unwrap(4),
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        word_count: row.get_unwrap(6),
        is_pinned: row.get_unwrap(7),
        is_archived: row.get_unwrap(8),
        is_favorite: row.get_unwrap(9),
        is_journal: row.get_unwrap(10),
        is_locked: row.get_unwrap(11),
        sort_order: row.get_unwrap(12),
        journal_date: row.get_unwrap(13),
        front_matter_data: row.get_unwrap(14),
        ideas_data: row.get_unwrap(15),
        needs_vault_sync: row.get_unwrap(16),
        last_synced_body_hash: row.get_unwrap(17),
        last_synced_at: row.get_unwrap(18),
        file_path: row.get_unwrap(19),
        subfolder: row.get_unwrap(20),
        parent_page_id: parent_str.and_then(|s| s.parse().ok()),
        folder_id: folder_str.and_then(|s| s.parse().ok()),
        template_id: row.get_unwrap(23),
        created_at: row.get_unwrap(24),
        updated_at: row.get_unwrap(25),
    }
}

fn row_to_folder(row: &rusqlite::Row<'_>) -> Folder {
    let id_str: String = row.get_unwrap(0);
    let parent_str: Option<String> = row.get_unwrap(5);
    Folder {
        id: id_str.parse().expect("valid folder id in db"),
        name: row.get_unwrap(1),
        emoji: row.get_unwrap(2),
        sort_order: row.get_unwrap(3),
        is_collection: row.get_unwrap(4),
        parent_folder_id: parent_str.and_then(|s| s.parse().ok()),
        created_at: row.get_unwrap(6),
    }
}

fn row_to_page_version(row: &rusqlite::Row<'_>) -> PageVersion {
    let page_str: String = row.get_unwrap(1);
    PageVersion {
        id: row.get_unwrap(0),
        page_id: page_str.parse().expect("valid page id in db"),
        hash: row.get_unwrap(2),
        parent_hash: row.get_unwrap(3),
        timestamp: row.get_unwrap(4),
        changes_summary: row.get_unwrap(5),
    }
}

fn row_to_block(row: &rusqlite::Row<'_>) -> Block {
    let id_str: String = row.get_unwrap(0);
    let page_str: String = row.get_unwrap(1);
    let parent_str: Option<String> = row.get_unwrap(2);
    Block {
        id: id_str.parse().expect("valid block id in db"),
        page_id: page_str.parse().expect("valid page id in db"),
        parent_block_id: parent_str.and_then(|s| s.parse().ok()),
        order: row.get_unwrap(3),
        depth: row.get_unwrap(4),
        content: row.get_unwrap(5),
        is_collapsed: row.get_unwrap(6),
        created_at: row.get_unwrap(7),
        updated_at: row.get_unwrap(8),
    }
}

fn row_to_chat(row: &rusqlite::Row<'_>) -> Chat {
    let id_str: String = row.get_unwrap(0);
    let ctx_str: Option<String> = row.get_unwrap(3);
    Chat {
        id: id_str.parse().expect("valid chat id in db"),
        title: row.get_unwrap(1),
        chat_type: row.get_unwrap(2),
        page_context_id: ctx_str.and_then(|s| s.parse().ok()),
        created_at: row.get_unwrap(4),
        updated_at: row.get_unwrap(5),
    }
}

fn row_to_message(row: &rusqlite::Row<'_>) -> Message {
    let id_str: String = row.get_unwrap(0);
    let chat_str: String = row.get_unwrap(1);
    Message {
        id: id_str.parse().expect("valid message id in db"),
        chat_id: chat_str.parse().expect("valid chat id in db"),
        role: row.get_unwrap(2),
        content: row.get_unwrap(3),
        dual_message_data: row.get_unwrap(4),
        truth_assessment_data: row.get_unwrap(5),
        confidence_score: row.get_unwrap(6),
        evidence_grade: row.get_unwrap(7),
        inference_mode: row.get_unwrap(8),
        is_streaming: row.get_unwrap(9),
        created_at: row.get_unwrap(10),
    }
}

fn row_to_graph_node(row: &rusqlite::Row<'_>) -> GraphNode {
    let id_str: String = row.get_unwrap(0);
    let type_int: i32 = row.get_unwrap(1);
    GraphNode {
        id: id_str.parse().expect("valid graph node id in db"),
        node_type: GraphNodeType::from_i32(type_int),
        label: row.get_unwrap(2),
        source_id: row.get_unwrap(3),
        weight: row.get_unwrap(4),
        metadata_json: row.get_unwrap(5),
        is_manual: row.get_unwrap(6),
        created_at: row.get_unwrap(7),
    }
}

fn row_to_graph_edge(row: &rusqlite::Row<'_>) -> GraphEdge {
    let id_str: String = row.get_unwrap(0);
    let src_str: String = row.get_unwrap(1);
    let tgt_str: String = row.get_unwrap(2);
    let type_int: i32 = row.get_unwrap(3);
    GraphEdge {
        id: id_str.parse().expect("valid graph edge id in db"),
        source_node_id: src_str.parse().expect("valid source node id in db"),
        target_node_id: tgt_str.parse().expect("valid target node id in db"),
        edge_type: GraphEdgeType::from_i32(type_int),
        weight: row.get_unwrap(4),
        is_manual: row.get_unwrap(5),
        created_at: row.get_unwrap(6),
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
    hash TEXT NOT NULL,
    parent_hash TEXT,
    timestamp INTEGER NOT NULL,
    changes_summary TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

-- FTS5 for full-text search — BM25-ranked, Unicode tokenizer
-- Weights: title=5x, body=1x, tags=2x (applied in BM25 query)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    page_id UNINDEXED,
    title,
    body,
    tags,
    tokenize='unicode61'
);
";
