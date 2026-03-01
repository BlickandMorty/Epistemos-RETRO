use storage::ids::*;

#[test]
fn page_id_serializes_as_uuid_string() {
    let id = PageId::new();
    let json = serde_json::to_string(&id).unwrap();
    assert!(json.starts_with('"'));
    assert!(json.ends_with('"'));
    assert_eq!(json.len(), 38); // 36 UUID + 2 quotes
}

#[test]
fn page_id_round_trips_through_json() {
    let original = PageId::new();
    let json = serde_json::to_string(&original).unwrap();
    let restored: PageId = serde_json::from_str(&json).unwrap();
    assert_eq!(original, restored);
}

#[test]
fn different_id_types_are_distinct() {
    let page_id = PageId::new();
    let chat_id = ChatId::new();
    assert_ne!(page_id.to_string(), chat_id.to_string());
}

#[test]
fn id_display_is_uuid_format() {
    let id = PageId::new();
    let s = id.to_string();
    assert_eq!(s.len(), 36);
    assert_eq!(s.chars().filter(|c| *c == '-').count(), 4);
}

#[test]
fn id_from_str_round_trips() {
    let id = BlockId::new();
    let s = id.to_string();
    let parsed: BlockId = s.parse().unwrap();
    assert_eq!(id, parsed);
}

#[test]
fn graph_node_type_roundtrip() {
    use storage::types::GraphNodeType;
    for i in 0..=7 {
        assert_eq!(GraphNodeType::from_i32(i).to_i32(), i);
    }
}

#[test]
fn page_mock_has_valid_timestamps() {
    use storage::types::Page;
    let page = Page::mock(PageId::new());
    assert!(page.created_at > 0);
    assert_eq!(page.created_at, page.updated_at);
    assert_eq!(page.title, "Untitled");
}
