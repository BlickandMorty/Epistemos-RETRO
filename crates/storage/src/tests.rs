#[cfg(test)]
#[allow(clippy::module_inception)]
mod tests {
    use crate::db::Database;
    use crate::ids::*;
    use crate::types::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("in-memory db should open")
    }

    // ── Page CRUD ──

    #[test]
    fn create_and_get_page() {
        let db = test_db();
        let page = Page::new("Test Page".into());
        db.insert_page(&page).expect("insert should succeed");

        let fetched = db.get_page(page.id).expect("get should succeed");
        assert_eq!(fetched.title, "Test Page");
        assert_eq!(fetched.id, page.id);
        assert_eq!(fetched.research_stage, 0);
    }

    #[test]
    fn list_pages_returns_all() {
        let db = test_db();
        db.insert_page(&Page::new("Alpha".into())).unwrap();
        db.insert_page(&Page::new("Beta".into())).unwrap();

        let pages = db.list_pages().unwrap();
        assert_eq!(pages.len(), 2);
    }

    #[test]
    fn update_page() {
        let db = test_db();
        let mut page = Page::new("Original".into());
        db.insert_page(&page).unwrap();

        page.title = "Updated".into();
        page.emoji = Some("🧠".into());
        page.is_pinned = true;
        page.word_count = 42;
        page.updated_at = now_ms();
        db.update_page(&page).unwrap();

        let fetched = db.get_page(page.id).unwrap();
        assert_eq!(fetched.title, "Updated");
        assert_eq!(fetched.emoji, Some("🧠".into()));
        assert!(fetched.is_pinned);
        assert_eq!(fetched.word_count, 42);
    }

    #[test]
    fn delete_page_cascades() {
        let db = test_db();
        let page = Page::new("Doomed".into());
        db.insert_page(&page).unwrap();
        db.save_body(page.id, "some body text").unwrap();

        let block = Block::new(page.id, "block content".into(), 0, 0);
        db.insert_block(&block).unwrap();

        db.delete_page(page.id).unwrap();

        // Page, body, and blocks all gone
        assert!(db.get_page(page.id).is_err());
        assert_eq!(db.load_body(page.id).unwrap(), "");
        assert_eq!(db.get_blocks_for_page(page.id).unwrap().len(), 0);
    }

    #[test]
    fn page_not_found_error() {
        let db = test_db();
        let id = PageId::new();
        let result = db.get_page(id);
        assert!(result.is_err());
    }

    #[test]
    fn page_tags_roundtrip() {
        let db = test_db();
        let mut page = Page::new("Tagged".into());
        page.tags = vec!["rust".into(), "wgpu".into(), "rapier".into()];
        db.insert_page(&page).unwrap();

        let fetched = db.get_page(page.id).unwrap();
        assert_eq!(fetched.tags, vec!["rust", "wgpu", "rapier"]);
    }

    // ── Body ──

    #[test]
    fn save_and_load_body() {
        let db = test_db();
        let page = Page::new("Body Test".into());
        db.insert_page(&page).unwrap();

        db.save_body(page.id, "# Hello\nWorld").unwrap();
        let body = db.load_body(page.id).unwrap();
        assert_eq!(body, "# Hello\nWorld");
    }

    #[test]
    fn save_body_upserts() {
        let db = test_db();
        let page = Page::new("Upsert".into());
        db.insert_page(&page).unwrap();

        db.save_body(page.id, "first").unwrap();
        db.save_body(page.id, "second").unwrap();
        assert_eq!(db.load_body(page.id).unwrap(), "second");
    }

    // ── Block CRUD ──

    #[test]
    fn blocks_for_page() {
        let db = test_db();
        let page = Page::new("Block Test".into());
        db.insert_page(&page).unwrap();

        let b1 = Block::new(page.id, "First bullet".into(), 0, 0);
        let b2 = Block::new(page.id, "Sub bullet".into(), 1, 1);
        db.insert_block(&b1).unwrap();
        db.insert_block(&b2).unwrap();

        let blocks = db.get_blocks_for_page(page.id).unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].content, "First bullet");
        assert_eq!(blocks[1].depth, 1);
    }

    // ── Chat + Message ──

    #[test]
    fn chat_lifecycle() {
        let db = test_db();
        let chat = Chat::new("Test Chat".into());
        db.insert_chat(&chat).unwrap();

        let fetched = db.get_chat(chat.id).unwrap();
        assert_eq!(fetched.title, "Test Chat");
        assert_eq!(fetched.chat_type, "general");

        let msg = Message::new(chat.id, "user".into(), "Hello?".into());
        db.insert_message(&msg).unwrap();

        let msgs = db.get_messages_for_chat(chat.id).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].content, "Hello?");
        assert_eq!(msgs[0].role, "user");

        // Delete cascades to messages
        db.delete_chat(chat.id).unwrap();
        assert!(db.get_chat(chat.id).is_err());
        assert_eq!(db.get_messages_for_chat(chat.id).unwrap().len(), 0);
    }

    // ── Graph ──

    #[test]
    fn graph_node_batch_insert() {
        let db = test_db();
        let nodes: Vec<GraphNode> = (0..5).map(|i| GraphNode {
            id: GraphNodeId::new(),
            node_type: GraphNodeType::Note,
            label: format!("Node {i}"),
            source_id: PageId::new().to_string(),
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now_ms(),
        }).collect();

        db.insert_graph_nodes_batch(&nodes).unwrap();
        let all = db.get_all_graph_nodes().unwrap();
        assert_eq!(all.len(), 5);
    }

    #[test]
    fn graph_edge_batch_insert() {
        let db = test_db();
        let n1 = GraphNodeId::new();
        let n2 = GraphNodeId::new();

        let edge = GraphEdge {
            id: GraphEdgeId::new(),
            source_node_id: n1,
            target_node_id: n2,
            edge_type: GraphEdgeType::Contains,
            weight: 1.0,
            metadata_json: None,
            is_manual: false,
            created_at: now_ms(),
        };
        db.insert_graph_edges_batch(&[edge]).unwrap();
        let edges = db.get_all_graph_edges().unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge_type, GraphEdgeType::Contains);
    }

    #[test]
    fn delete_auto_graph_preserves_manual() {
        let db = test_db();
        let auto_node = GraphNode {
            id: GraphNodeId::new(), node_type: GraphNodeType::Tag,
            label: "auto".into(), source_id: String::new(),
            weight: 1.0, metadata_json: None, is_manual: false, created_at: now_ms(),
        };
        let manual_node = GraphNode {
            id: GraphNodeId::new(), node_type: GraphNodeType::Tag,
            label: "manual".into(), source_id: String::new(),
            weight: 1.0, metadata_json: None, is_manual: true, created_at: now_ms(),
        };
        db.insert_graph_node(&auto_node).unwrap();
        db.insert_graph_node(&manual_node).unwrap();

        db.delete_auto_graph_nodes().unwrap();
        let remaining = db.get_all_graph_nodes().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].label, "manual");
    }

    // ── Node/Edge type conversions ──

    #[test]
    fn node_type_roundtrip() {
        for i in 0..=7 {
            assert_eq!(GraphNodeType::from_i32(i).to_i32(), i);
        }
    }

    #[test]
    fn edge_type_roundtrip() {
        for i in 0..=11 {
            assert_eq!(GraphEdgeType::from_i32(i).to_i32(), i);
        }
    }

    // ── Settings ──

    #[test]
    fn settings_kv() {
        let db = test_db();
        assert_eq!(db.get_setting("foo").unwrap(), None);

        db.set_setting("foo", "bar").unwrap();
        assert_eq!(db.get_setting("foo").unwrap(), Some("bar".into()));

        db.set_setting("foo", "baz").unwrap();
        assert_eq!(db.get_setting("foo").unwrap(), Some("baz".into()));
    }

    // ── Folders ──

    #[test]
    fn folder_crud() {
        let db = test_db();
        let folder = Folder::new("Research".into());
        db.insert_folder(&folder).unwrap();

        let folders = db.list_folders().unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "Research");
    }

    // ── Message dual_message_data ──

    #[test]
    fn update_message_dual_data_targets_latest_assistant() {
        let db = test_db();
        let chat = Chat::new("Dual Test".into());
        db.insert_chat(&chat).unwrap();

        // Insert user → assistant → user → assistant sequence
        let m1 = Message::new(chat.id, "user".into(), "Q1".into());
        db.insert_message(&m1).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));

        let m2 = Message::new(chat.id, "assistant".into(), "A1".into());
        db.insert_message(&m2).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));

        let m3 = Message::new(chat.id, "user".into(), "Q2".into());
        db.insert_message(&m3).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(2));

        let m4 = Message::new(chat.id, "assistant".into(), "A2".into());
        db.insert_message(&m4).unwrap();

        // Update dual data — should target m4 (latest assistant)
        db.update_message_dual_data(chat.id, r#"{"enriched":true}"#).unwrap();

        let msgs = db.get_messages_for_chat(chat.id).unwrap();
        assert_eq!(msgs.len(), 4);
        // m2 (first assistant) should NOT have dual data
        assert!(msgs[1].dual_message_data.is_none());
        // m4 (latest assistant) should have dual data
        assert_eq!(msgs[3].dual_message_data, Some(r#"{"enriched":true}"#.into()));
    }

    #[test]
    fn update_message_dual_data_no_assistant_is_noop() {
        let db = test_db();
        let chat = Chat::new("No Assistant".into());
        db.insert_chat(&chat).unwrap();

        let m1 = Message::new(chat.id, "user".into(), "Hello".into());
        db.insert_message(&m1).unwrap();

        // Should not panic — just updates 0 rows
        db.update_message_dual_data(chat.id, "data").unwrap();

        let msgs = db.get_messages_for_chat(chat.id).unwrap();
        assert!(msgs[0].dual_message_data.is_none());
    }

    // ── Message ordering ──

    #[test]
    fn messages_returned_in_chronological_order() {
        let db = test_db();
        let chat = Chat::new("Order Test".into());
        db.insert_chat(&chat).unwrap();

        for i in 0..5 {
            std::thread::sleep(std::time::Duration::from_millis(2));
            let msg = Message::new(chat.id, "user".into(), format!("msg-{i}"));
            db.insert_message(&msg).unwrap();
        }

        let msgs = db.get_messages_for_chat(chat.id).unwrap();
        assert_eq!(msgs.len(), 5);
        for (i, msg) in msgs.iter().enumerate().take(5) {
            assert_eq!(msg.content, format!("msg-{i}"));
        }
        // Timestamps should be non-decreasing
        for w in msgs.windows(2) {
            assert!(w[0].created_at <= w[1].created_at);
        }
    }

    // ── Block hierarchy ──

    #[test]
    fn blocks_preserve_depth_and_order() {
        let db = test_db();
        let page = Page::new("Block Hierarchy".into());
        db.insert_page(&page).unwrap();

        let b0 = Block::new(page.id, "Top level".into(), 0, 0);
        let b1 = Block::new(page.id, "Child 1".into(), 1, 1);
        let b2 = Block::new(page.id, "Child 2".into(), 2, 1);
        let b3 = Block::new(page.id, "Grandchild".into(), 3, 2);
        db.insert_block(&b0).unwrap();
        db.insert_block(&b1).unwrap();
        db.insert_block(&b2).unwrap();
        db.insert_block(&b3).unwrap();

        let blocks = db.get_blocks_for_page(page.id).unwrap();
        assert_eq!(blocks.len(), 4);
        assert_eq!(blocks[0].depth, 0);
        assert_eq!(blocks[1].depth, 1);
        assert_eq!(blocks[2].depth, 1);
        assert_eq!(blocks[3].depth, 2);
        // Orders should be sequential
        for (i, b) in blocks.iter().enumerate() {
            assert_eq!(b.order, i as i32);
        }
    }

    // ── Graph edge+node roundtrip ──

    #[test]
    fn graph_full_roundtrip_nodes_and_edges() {
        let db = test_db();
        let n1 = GraphNode {
            id: GraphNodeId::new(), node_type: GraphNodeType::Note,
            label: "Alpha".into(), source_id: "src-a".into(),
            weight: 1.0, metadata_json: Some(r#"{"key":"val"}"#.into()),
            is_manual: false, created_at: now_ms(),
        };
        let n2 = GraphNode {
            id: GraphNodeId::new(), node_type: GraphNodeType::Tag,
            label: "Beta".into(), source_id: "src-b".into(),
            weight: 0.5, metadata_json: None,
            is_manual: true, created_at: now_ms(),
        };
        db.insert_graph_nodes_batch(&[n1.clone(), n2.clone()]).unwrap();

        let edge = GraphEdge {
            id: GraphEdgeId::new(), source_node_id: n1.id,
            target_node_id: n2.id, edge_type: GraphEdgeType::Supports,
            weight: 0.8, metadata_json: None, is_manual: false, created_at: now_ms(),
        };
        db.insert_graph_edges_batch(std::slice::from_ref(&edge)).unwrap();

        let nodes = db.get_all_graph_nodes().unwrap();
        let edges = db.get_all_graph_edges().unwrap();
        assert_eq!(nodes.len(), 2);
        assert_eq!(edges.len(), 1);

        // Verify metadata_json survives roundtrip
        let alpha = nodes.iter().find(|n| n.label == "Alpha").unwrap();
        assert_eq!(alpha.metadata_json, Some(r#"{"key":"val"}"#.into()));
        assert!(!alpha.is_manual);

        // Verify edge types
        assert_eq!(edges[0].edge_type, GraphEdgeType::Supports);
        assert!((edges[0].weight - 0.8).abs() < 0.01);
    }

    // ── Settings overwrite ──

    #[test]
    fn settings_multiple_keys_independent() {
        let db = test_db();
        db.set_setting("provider", "anthropic").unwrap();
        db.set_setting("model", "claude-opus-4-6").unwrap();
        db.set_setting("api_key", "sk-test").unwrap();

        assert_eq!(db.get_setting("provider").unwrap(), Some("anthropic".into()));
        assert_eq!(db.get_setting("model").unwrap(), Some("claude-opus-4-6".into()));
        assert_eq!(db.get_setting("api_key").unwrap(), Some("sk-test".into()));

        // Overwrite one doesn't affect others
        db.set_setting("provider", "openai").unwrap();
        assert_eq!(db.get_setting("provider").unwrap(), Some("openai".into()));
        assert_eq!(db.get_setting("model").unwrap(), Some("claude-opus-4-6".into()));
    }

    // ── Large body text ──

    #[test]
    fn save_body_handles_large_text() {
        let db = test_db();
        let page = Page::new("Large Body".into());
        db.insert_page(&page).unwrap();

        // 100KB of text
        let body = "Lorem ipsum dolor sit amet. ".repeat(4000);
        db.save_body(page.id, &body).unwrap();
        let loaded = db.load_body(page.id).unwrap();
        assert_eq!(loaded.len(), body.len());
    }

    // ── FTS5 Full-Text Search ──

    #[test]
    fn fts5_search_finds_by_title() {
        let db = test_db();
        let page = Page::new("Quantum Mechanics".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Quantum Mechanics", "Physics intro", "physics, quantum").unwrap();

        let results = db.search_fts5("quantum", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].page_id, page.id);
        assert!(results[0].score > 0.0);
    }

    #[test]
    fn fts5_search_finds_by_body() {
        let db = test_db();
        let page = Page::new("My Notes".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "My Notes", "Einstein discovered relativity theory", "physics").unwrap();

        let results = db.search_fts5("relativity", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].page_id, page.id);
    }

    #[test]
    fn fts5_search_finds_by_tags() {
        let db = test_db();
        let page = Page::new("Tagged Note".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Tagged Note", "Some body", "rust, wgpu, rapier").unwrap();

        let results = db.search_fts5("rapier", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn fts5_search_ranks_title_higher() {
        let db = test_db();
        let p1 = Page::new("Machine Learning".into());
        let p2 = Page::new("Random Note".into());
        db.insert_page(&p1).unwrap();
        db.insert_page(&p2).unwrap();
        db.upsert_search_index(p1.id, "Machine Learning", "Deep learning models", "ai").unwrap();
        db.upsert_search_index(p2.id, "Random Note", "Machine learning is interesting", "misc").unwrap();

        let results = db.search_fts5("machine learning", 10).unwrap();
        assert_eq!(results.len(), 2);
        // Title match (p1) should rank higher than body match (p2)
        assert_eq!(results[0].page_id, p1.id);
    }

    #[test]
    fn fts5_search_empty_query_returns_nothing() {
        let db = test_db();
        let page = Page::new("Test".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Test", "body", "tags").unwrap();

        assert!(db.search_fts5("", 10).unwrap().is_empty());
        assert!(db.search_fts5("  ", 10).unwrap().is_empty());
        assert!(db.search_fts5("a", 10).unwrap().is_empty()); // single char filtered
    }

    #[test]
    fn fts5_upsert_replaces_old_content() {
        let db = test_db();
        let page = Page::new("Evolving Note".into());
        db.insert_page(&page).unwrap();

        db.upsert_search_index(page.id, "Evolving Note", "Original content", "v1").unwrap();
        assert_eq!(db.search_fts5("original", 10).unwrap().len(), 1);

        db.upsert_search_index(page.id, "Evolving Note", "Updated content", "v2").unwrap();
        assert!(db.search_fts5("original", 10).unwrap().is_empty());
        assert_eq!(db.search_fts5("updated", 10).unwrap().len(), 1);
    }

    #[test]
    fn fts5_delete_removes_from_index() {
        let db = test_db();
        let page = Page::new("Doomed Search".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Doomed Search", "body", "tags").unwrap();
        assert_eq!(db.search_fts5("doomed", 10).unwrap().len(), 1);

        db.delete_search_index(page.id).unwrap();
        assert!(db.search_fts5("doomed", 10).unwrap().is_empty());
    }

    #[test]
    fn fts5_prefix_search() {
        let db = test_db();
        let page = Page::new("Neuroscience Research".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Neuroscience Research", "Brain studies", "neuro").unwrap();

        // "neuro" should match "neuroscience" via prefix
        let results = db.search_fts5("neuro", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn fts5_rebuild_index() {
        let db = test_db();
        let p1 = Page::new("Alpha Note".into());
        let p2 = Page::new("Beta Note".into());
        let mut p3 = Page::new("Archived Note".into());
        p3.is_archived = true;
        db.insert_page(&p1).unwrap();
        db.insert_page(&p2).unwrap();
        db.insert_page(&p3).unwrap();
        db.save_body(p1.id, "Alpha body content").unwrap();
        db.save_body(p2.id, "Beta body content").unwrap();
        db.save_body(p3.id, "Archived body content").unwrap();

        let count = db.rebuild_search_index().unwrap();
        assert_eq!(count, 2, "archived pages should be excluded from index");

        assert_eq!(db.search_fts5("alpha", 10).unwrap().len(), 1);
        assert_eq!(db.search_fts5("beta", 10).unwrap().len(), 1);
        assert!(db.search_fts5("archived", 10).unwrap().is_empty());
    }

    #[test]
    fn fts5_limit_respected() {
        let db = test_db();
        for i in 0..10 {
            let page = Page::new(format!("Search Test Note {i}"));
            db.insert_page(&page).unwrap();
            db.upsert_search_index(page.id, &format!("Search Test Note {i}"), "common body", "test").unwrap();
        }

        let results = db.search_fts5("search test", 3).unwrap();
        assert_eq!(results.len(), 3);
    }

    // ── Page archive exclusion ──

    #[test]
    fn archived_page_still_retrievable() {
        let db = test_db();
        let mut page = Page::new("Archive Me".into());
        page.is_archived = true;
        db.insert_page(&page).unwrap();

        // Direct get still works
        let fetched = db.get_page(page.id).unwrap();
        assert!(fetched.is_archived);

        // list_pages includes archived
        let all = db.list_pages().unwrap();
        assert!(all.iter().any(|p| p.id == page.id));
    }

    // ── Security: FTS5 injection ────────────────────────

    #[test]
    fn fts5_injection_attempt_does_not_crash() {
        let db = test_db();
        let page = Page::new("Safe Page".into());
        db.insert_page(&page).unwrap();
        db.upsert_search_index(page.id, "Safe Page", "Some content", "tags").unwrap();

        // FTS5 operators should be stripped by sanitizer, not cause errors
        let injection_queries = vec![
            "safe OR 1=1",
            "safe NOT page",
            "safe NEAR/5 page",
            r#""safe" AND "page""#,
            "safe* {col:title}",
            "safe); DROP TABLE pages; --",
            "safe\" OR \"\"=\"",
        ];

        for query in injection_queries {
            // Should not panic or error — may return empty or matching results
            let result = db.search_fts5(query, 10);
            assert!(result.is_ok(), "FTS5 should handle injection attempt: {query}");
        }
    }

    #[test]
    fn like_wildcard_escaped_in_title_search() {
        let db = test_db();
        let p1 = Page::new("test_page".into());
        let p2 = Page::new("testXpage".into());
        db.insert_page(&p1).unwrap();
        db.insert_page(&p2).unwrap();

        // Searching for literal underscore should NOT match "testXpage"
        // because _ is a LIKE wildcard and must be escaped
        let results = db.search_pages_by_title("test_page").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "test_page");
    }

    #[test]
    fn like_wildcard_percent_escaped() {
        let db = test_db();
        let p1 = Page::new("100% done".into());
        let p2 = Page::new("100 done".into());
        db.insert_page(&p1).unwrap();
        db.insert_page(&p2).unwrap();

        // Searching for literal % should match only "100% done"
        let results = db.search_pages_by_title("100%").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "100% done");
    }

    // ── WAL mode (file-based DB) ──

    #[test]
    fn wal_mode_enabled_on_file_db() {
        let dir = std::env::temp_dir().join(format!("epistemos_wal_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");

        let db = Database::open(&db_path).expect("open file db");
        assert_eq!(db.pragma_str("journal_mode").unwrap(), "wal");
        assert_eq!(db.pragma_i64("synchronous").unwrap(), 1, "NORMAL=1");
        assert_eq!(db.pragma_i64("busy_timeout").unwrap(), 5000);

        std::fs::remove_dir_all(&dir).ok();
    }

    // ── FTS5 auto-sync triggers ──

    #[test]
    fn fts5_trigger_auto_indexes_on_save_body() {
        let db = test_db();
        let page = Page::new("Trigger Test".into());
        db.insert_page(&page).unwrap();

        // save_body should auto-sync to FTS5 via trigger (no manual upsert_search_index)
        db.save_body(page.id, "quantum entanglement experiments").unwrap();

        let results = db.search_fts5("quantum", 10).unwrap();
        assert_eq!(results.len(), 1, "trigger should auto-index body on save");
        assert_eq!(results[0].page_id, page.id);
    }

    #[test]
    fn fts5_trigger_updates_on_body_change() {
        let db = test_db();
        let page = Page::new("Evolving Body".into());
        db.insert_page(&page).unwrap();

        db.save_body(page.id, "first version about cats").unwrap();
        assert_eq!(db.search_fts5("cats", 10).unwrap().len(), 1);

        // Update body — trigger should re-index
        db.save_body(page.id, "second version about dogs").unwrap();
        assert!(db.search_fts5("cats", 10).unwrap().is_empty(), "old content should be gone");
        assert_eq!(db.search_fts5("dogs", 10).unwrap().len(), 1, "new content should be indexed");
    }

    #[test]
    fn fts5_trigger_removes_on_body_delete() {
        let db = test_db();
        let page = Page::new("Delete Body".into());
        db.insert_page(&page).unwrap();
        db.save_body(page.id, "unique searchterm xyzzy").unwrap();
        assert_eq!(db.search_fts5("xyzzy", 10).unwrap().len(), 1);

        // delete_page cascades to page_bodies → trigger removes from search_index
        db.delete_page(page.id).unwrap();
        assert!(db.search_fts5("xyzzy", 10).unwrap().is_empty());
    }

    #[test]
    fn fts5_trigger_syncs_title_change() {
        let db = test_db();
        let mut page = Page::new("Original Title".into());
        db.insert_page(&page).unwrap();
        db.save_body(page.id, "some body content").unwrap();

        // Title should be searchable from trigger
        assert_eq!(db.search_fts5("original", 10).unwrap().len(), 1);

        // Update title — trigger on pages UPDATE OF title should re-index
        page.title = "Renamed Title".into();
        page.updated_at = now_ms();
        db.update_page(&page).unwrap();

        assert!(db.search_fts5("original", 10).unwrap().is_empty(), "old title gone");
        assert_eq!(db.search_fts5("renamed", 10).unwrap().len(), 1, "new title indexed");
    }

    // ── Transactional FTS5 rebuild ──

    #[test]
    fn fts5_rebuild_is_transactional() {
        let db = test_db();

        // Create 50 pages with bodies
        for i in 0..50 {
            let page = Page::new(format!("Bulk Page {i}"));
            db.insert_page(&page).unwrap();
            db.save_body(page.id, &format!("Body content for page {i}")).unwrap();
        }

        let count = db.rebuild_search_index().unwrap();
        assert_eq!(count, 50);

        // Spot-check a few entries
        assert_eq!(db.search_fts5("bulk page", 100).unwrap().len(), 50);
    }
}
