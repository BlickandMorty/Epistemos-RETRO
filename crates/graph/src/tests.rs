use storage::db::Database;
use storage::ids::*;
use storage::types::*;

use crate::builder::GraphBuilder;
use crate::store::{EdgeRecord, GraphStore, NodeRecord};

// ── GraphStore Tests ───────────────────────────────────────────────────

fn make_node(id: &str, label: &str, node_type: GraphNodeType) -> NodeRecord {
    NodeRecord {
        id: id.into(),
        node_type,
        label: label.into(),
        source_id: id.into(),
        metadata_json: None,
        weight: 1.0,
        created_at: 0,
        x: 0.0, y: 0.0, z: 0.0,
        vx: 0.0, vy: 0.0, vz: 0.0,
        is_visible: true,
        is_pinned: false,
    }
}

fn make_edge(id: &str, src: &str, tgt: &str, edge_type: GraphEdgeType) -> EdgeRecord {
    EdgeRecord {
        id: id.into(),
        source_node_id: src.into(),
        target_node_id: tgt.into(),
        edge_type,
        weight: 1.0,
        created_at: 0,
    }
}

fn sample_store() -> GraphStore {
    let mut store = GraphStore::new();
    store.add_node(make_node("n1", "Epistemology", GraphNodeType::Note));
    store.add_node(make_node("n2", "Ethics", GraphNodeType::Note));
    store.add_node(make_node("n3", "Logic", GraphNodeType::Note));
    store.add_node(make_node("t1", "philosophy", GraphNodeType::Tag));
    store.add_edge(make_edge("e1", "n1", "t1", GraphEdgeType::Tagged));
    store.add_edge(make_edge("e2", "n2", "t1", GraphEdgeType::Tagged));
    store.add_edge(make_edge("e3", "n1", "n3", GraphEdgeType::Supports));
    store
}

#[test]
fn store_add_and_counts() {
    let store = sample_store();
    assert_eq!(store.node_count(), 4);
    assert_eq!(store.edge_count(), 3);
}

#[test]
fn store_neighbors() {
    let store = sample_store();
    let neighbors: Vec<String> = store.neighbors("t1").iter().map(|n| n.id.clone()).collect();
    assert!(neighbors.contains(&"n1".to_string()));
    assert!(neighbors.contains(&"n2".to_string()));
    assert_eq!(neighbors.len(), 2);
}

#[test]
fn store_edges_for_node() {
    let store = sample_store();
    let edges = store.edges_for("n1");
    assert_eq!(edges.len(), 2); // tagged + supports
}

#[test]
fn store_nodes_of_type() {
    let store = sample_store();
    assert_eq!(store.nodes_of_type(GraphNodeType::Note).len(), 3);
    assert_eq!(store.nodes_of_type(GraphNodeType::Tag).len(), 1);
    assert_eq!(store.nodes_of_type(GraphNodeType::Chat).len(), 0);
}

#[test]
fn store_node_by_source() {
    let store = sample_store();
    let node = store.node_by_source("n1", GraphNodeType::Note);
    assert!(node.is_some());
    assert_eq!(node.unwrap().label, "Epistemology");

    // Wrong type
    assert!(store.node_by_source("n1", GraphNodeType::Tag).is_none());
}

#[test]
fn store_link_count() {
    let store = sample_store();
    assert_eq!(store.link_count("t1"), 2);
    assert_eq!(store.link_count("n1"), 2);
    assert_eq!(store.link_count("n2"), 1);
    assert_eq!(store.link_count("n3"), 1);
    assert_eq!(store.link_count("nonexistent"), 0);
}

#[test]
fn store_bfs_connected() {
    let store = sample_store();
    let connected = store.connected("n1", 1);
    assert!(connected.contains("n1"));
    assert!(connected.contains("t1"));
    assert!(connected.contains("n3"));
    assert!(!connected.contains("n2")); // n2 is 2 hops away

    let connected_2 = store.connected("n1", 2);
    assert!(connected_2.contains("n2")); // now reachable via t1
}

#[test]
fn store_shortest_path() {
    let store = sample_store();
    // n2 → t1 → n1
    let path = store.shortest_path("n2", "n1", 5);
    assert_eq!(path.len(), 3);
    assert_eq!(path[0], "n2");
    assert_eq!(path[2], "n1");

    // No path beyond max_hops=1
    let short = store.shortest_path("n2", "n3", 1);
    assert!(short.is_empty()); // n2→n3 is 3 hops

    // Same node
    let same = store.shortest_path("n1", "n1", 5);
    assert_eq!(same, vec!["n1"]);
}

#[test]
fn store_nodes_linked_by() {
    let store = sample_store();
    let supporters = store.nodes_linked_by(GraphEdgeType::Supports, "n1");
    assert_eq!(supporters.len(), 1);
    assert_eq!(supporters[0].id, "n3");

    let tagged = store.nodes_linked_by(GraphEdgeType::Tagged, "t1");
    assert_eq!(tagged.len(), 2);
}

#[test]
fn store_remove_node() {
    let mut store = sample_store();
    store.remove_node("t1");
    assert_eq!(store.node_count(), 3);
    assert_eq!(store.edge_count(), 1); // only n1→n3 supports remains
    assert_eq!(store.link_count("n1"), 1);
    assert_eq!(store.link_count("n2"), 0);
}

#[test]
fn store_remove_edge() {
    let mut store = sample_store();
    store.remove_edge("e1"); // n1→t1 tagged
    assert_eq!(store.edge_count(), 2);
    assert_eq!(store.link_count("n1"), 1); // only supports left
}

#[test]
fn store_fuzzy_search_exact() {
    let store = sample_store();
    let hits = store.fuzzy_search("epistemology", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].score, 1.0);
}

#[test]
fn store_fuzzy_search_prefix() {
    let store = sample_store();
    let hits = store.fuzzy_search("epist", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].score, 0.9);
}

#[test]
fn store_fuzzy_search_contains() {
    let store = sample_store();
    let hits = store.fuzzy_search("hic", 10);
    // "Ethics" contains "hic"
    assert!(hits.iter().any(|h| h.label == "Ethics" && h.score == 0.6));
}

#[test]
fn store_fuzzy_search_subsequence() {
    let store = sample_store();
    let hits = store.fuzzy_search("lgc", 10);
    // "Logic" → l...o...g...i...c... "lgc" as subsequence
    assert!(hits.iter().any(|h| h.label == "Logic" && h.score == 0.3));
}

#[test]
fn store_load_from_storage_types() {
    let gn1 = GraphNode {
        id: GraphNodeId::new(),
        node_type: GraphNodeType::Note,
        label: "Test Note".into(),
        source_id: "src-1".into(),
        weight: 2.0,
        metadata_json: None,
        is_manual: false,
        created_at: 1000,
    };
    let gn2 = GraphNode {
        id: GraphNodeId::new(),
        node_type: GraphNodeType::Tag,
        label: "rust".into(),
        source_id: "tag-rust".into(),
        weight: 1.0,
        metadata_json: None,
        is_manual: false,
        created_at: 1000,
    };
    let ge = GraphEdge {
        id: GraphEdgeId::new(),
        source_node_id: gn1.id,
        target_node_id: gn2.id,
        edge_type: GraphEdgeType::Tagged,
        weight: 1.0,
        metadata_json: None,
        is_manual: false,
        created_at: 1000,
    };

    let mut store = GraphStore::new();
    store.load(&[gn1.clone(), gn2.clone()], &[ge]);

    assert_eq!(store.node_count(), 2);
    assert_eq!(store.edge_count(), 1);

    // Phyllotaxis positions should be non-zero for second node
    let n2 = store.nodes.get(&gn2.id.to_string()).unwrap();
    assert!(n2.x != 0.0 || n2.y != 0.0);
}

// ── GraphBuilder Tests ─────────────────────────────────────────────────

fn test_db() -> Database {
    Database::open_in_memory().expect("in-memory db")
}

#[test]
fn builder_empty_db() {
    let db = test_db();
    let result = GraphBuilder::build(&db).expect("build");
    assert!(result.nodes.is_empty());
    assert!(result.edges.is_empty());
}

#[test]
fn builder_pages_become_note_nodes() {
    let db = test_db();
    let page = Page::new("Epistemology".into());
    db.insert_page(&page).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    assert_eq!(result.nodes.len(), 1);
    assert_eq!(result.nodes[0].node_type, GraphNodeType::Note);
    assert_eq!(result.nodes[0].label, "Epistemology");
}

#[test]
fn builder_archived_pages_excluded() {
    let db = test_db();
    let mut page = Page::new("Archived Note".into());
    page.is_archived = true;
    db.insert_page(&page).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    assert!(result.nodes.is_empty());
}

#[test]
fn builder_tags_create_nodes_and_edges() {
    let db = test_db();
    let mut page = Page::new("Tagged Note".into());
    page.tags = vec!["rust".into(), "philosophy".into()];
    db.insert_page(&page).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    // 1 note + 2 tags = 3 nodes
    assert_eq!(result.nodes.len(), 3);
    // 2 tagged edges
    assert_eq!(result.edges.len(), 2);
    assert!(result.edges.iter().all(|e| e.edge_type == GraphEdgeType::Tagged));
}

#[test]
fn builder_duplicate_tags_deduplicated() {
    let db = test_db();
    let mut p1 = Page::new("Note A".into());
    p1.tags = vec!["rust".into()];
    let mut p2 = Page::new("Note B".into());
    p2.tags = vec!["rust".into()];
    db.insert_page(&p1).expect("insert");
    db.insert_page(&p2).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    // 2 notes + 1 tag (deduplicated) = 3 nodes
    assert_eq!(result.nodes.len(), 3);
    // 2 tagged edges (one per page→tag)
    assert_eq!(result.edges.len(), 2);
}

#[test]
fn builder_blocks_with_content() {
    let db = test_db();
    let page = Page::new("With Blocks".into());
    db.insert_page(&page).expect("insert");

    let block = Block::new(page.id, "This is a substantial block with enough content.".into(), 0, 0);
    db.insert_block(&block).expect("insert");

    let short_block = Block::new(page.id, "Too short".into(), 1, 0);
    db.insert_block(&short_block).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    // 1 note + 1 block (short one excluded) = 2 nodes
    assert_eq!(result.nodes.len(), 2);
    // 1 contains edge
    assert_eq!(result.edges.len(), 1);
    assert_eq!(result.edges[0].edge_type, GraphEdgeType::Contains);
}

#[test]
fn builder_folders_create_nodes() {
    let db = test_db();
    let folder = Folder::new("Research".into());
    db.insert_folder(&folder).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    assert_eq!(result.nodes.len(), 1);
    assert_eq!(result.nodes[0].node_type, GraphNodeType::Folder);
}

#[test]
fn builder_chats_create_nodes() {
    let db = test_db();
    let chat = Chat::new("Discussion".into());
    db.insert_chat(&chat).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    assert_eq!(result.nodes.len(), 1);
    assert_eq!(result.nodes[0].node_type, GraphNodeType::Chat);
}

#[test]
fn builder_persist_roundtrip() {
    let db = test_db();
    let mut page = Page::new("Roundtrip".into());
    page.tags = vec!["test".into()];
    db.insert_page(&page).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    GraphBuilder::persist(&db, &result).expect("persist");

    let stored_nodes = db.get_all_graph_nodes().expect("nodes");
    let stored_edges = db.get_all_graph_edges().expect("edges");

    assert_eq!(stored_nodes.len(), result.nodes.len());
    assert_eq!(stored_edges.len(), result.edges.len());
}

#[test]
fn builder_persist_clears_old_auto() {
    let db = test_db();
    let page = Page::new("First".into());
    db.insert_page(&page).expect("insert");

    // First build + persist
    let r1 = GraphBuilder::build(&db).expect("build");
    GraphBuilder::persist(&db, &r1).expect("persist");
    assert_eq!(db.get_all_graph_nodes().expect("nodes").len(), 1);

    // Delete the page, rebuild — should clear old node
    db.delete_page(page.id).expect("delete");
    let r2 = GraphBuilder::build(&db).expect("build");
    GraphBuilder::persist(&db, &r2).expect("persist");
    assert!(db.get_all_graph_nodes().expect("nodes").is_empty());
}

#[test]
fn builder_note_folder_edges() {
    let db = test_db();
    let folder = Folder::new("Research".into());
    db.insert_folder(&folder).expect("insert");

    let mut page = Page::new("In Folder".into());
    page.folder_id = Some(folder.id);
    db.insert_page(&page).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    // 1 note + 1 folder = 2 nodes
    assert_eq!(result.nodes.len(), 2);
    // 1 contains edge
    let contains = result.edges.iter().filter(|e| e.edge_type == GraphEdgeType::Contains).count();
    assert_eq!(contains, 1);
}

#[test]
fn builder_nested_pages_reference() {
    let db = test_db();
    let parent = Page::new("Parent".into());
    db.insert_page(&parent).expect("insert");

    let mut child = Page::new("Child".into());
    child.parent_page_id = Some(parent.id);
    db.insert_page(&child).expect("insert");

    let result = GraphBuilder::build(&db).expect("build");
    assert_eq!(result.nodes.len(), 2);
    let refs = result.edges.iter().filter(|e| e.edge_type == GraphEdgeType::Reference).count();
    assert_eq!(refs, 1);
}
