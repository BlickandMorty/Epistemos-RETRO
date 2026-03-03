//! Saved Queries
//!
//! Persistent storage for saved search queries.
//! Saved queries are stored in the settings table as JSON.

use super::ast::{SavedQuery, QueryError};
use storage::db::Database;
use storage::types::now_ms;
use serde_json;

const SAVED_QUERIES_KEY: &str = "saved_queries";

/// Get all saved queries
pub fn get_saved_queries(db: &Database) -> Result<Vec<SavedQuery>, QueryError> {
    let json_str = db.get_setting(SAVED_QUERIES_KEY)
        .map_err(|e| QueryError::new(format!("Failed to load saved queries: {}", e)))?;
    
    match json_str {
        Some(json) => {
            let queries: Vec<SavedQuery> = serde_json::from_str(&json)
                .map_err(|e| QueryError::new(format!("Failed to parse saved queries: {}", e)))?;
            Ok(queries)
        }
        None => Ok(Vec::new()),
    }
}

/// Save a new query
pub fn save_query(db: &Database, name: String, query: String) -> Result<SavedQuery, QueryError> {
    let mut queries = get_saved_queries(db)?;
    
    // Check for duplicate name
    if queries.iter().any(|q| q.name == name) {
        return Err(QueryError::new(format!("Query with name '{}' already exists", name)));
    }
    
    let saved_query = SavedQuery {
        name: name.clone(),
        query,
        created_at: now_ms(),
        last_used_at: None,
        use_count: 0,
    };
    
    queries.push(saved_query.clone());
    
    // Save back to settings
    let json = serde_json::to_string(&queries)
        .map_err(|e| QueryError::new(format!("Failed to serialize saved queries: {}", e)))?;
    
    db.set_setting(SAVED_QUERIES_KEY, &json)
        .map_err(|e| QueryError::new(format!("Failed to save queries: {}", e)))?;
    
    Ok(saved_query)
}

/// Delete a saved query by name
pub fn delete_query(db: &Database, name: &str) -> Result<(), QueryError> {
    let mut queries = get_saved_queries(db)?;
    
    let initial_len = queries.len();
    queries.retain(|q| q.name != name);
    
    if queries.len() == initial_len {
        return Err(QueryError::new(format!("Query '{}' not found", name)));
    }
    
    // Save back to settings
    let json = serde_json::to_string(&queries)
        .map_err(|e| QueryError::new(format!("Failed to serialize saved queries: {}", e)))?;
    
    db.set_setting(SAVED_QUERIES_KEY, &json)
        .map_err(|e| QueryError::new(format!("Failed to save queries: {}", e)))?;
    
    Ok(())
}

/// Update an existing saved query
pub fn update_query(db: &Database, name: &str, new_query: String) -> Result<SavedQuery, QueryError> {
    let mut queries = get_saved_queries(db)?;
    
    let index = queries.iter()
        .position(|q| q.name == name)
        .ok_or_else(|| QueryError::new(format!("Query '{}' not found", name)))?;
    
    queries[index].query = new_query;
    let updated = queries[index].clone();
    
    // Save back to settings
    let json = serde_json::to_string(&queries)
        .map_err(|e| QueryError::new(format!("Failed to serialize saved queries: {}", e)))?;
    
    db.set_setting(SAVED_QUERIES_KEY, &json)
        .map_err(|e| QueryError::new(format!("Failed to save queries: {}", e)))?;
    
    Ok(updated)
}

/// Record a query usage (increment use_count and update last_used_at)
pub fn record_query_use(db: &Database, name: &str) -> Result<(), QueryError> {
    let mut queries = get_saved_queries(db)?;
    
    if let Some(query) = queries.iter_mut().find(|q| q.name == name) {
        query.use_count += 1;
        query.last_used_at = Some(now_ms());
        
        let json = serde_json::to_string(&queries)
            .map_err(|e| QueryError::new(format!("Failed to serialize saved queries: {}", e)))?;
        
        db.set_setting(SAVED_QUERIES_KEY, &json)
            .map_err(|e| QueryError::new(format!("Failed to save queries: {}", e)))?;
    }
    
    Ok(())
}

/// Get a single saved query by name
pub fn get_saved_query(db: &Database, name: &str) -> Result<Option<SavedQuery>, QueryError> {
    let queries = get_saved_queries(db)?;
    Ok(queries.into_iter().find(|q| q.name == name))
}

/// Rename a saved query
pub fn rename_query(db: &Database, old_name: &str, new_name: String) -> Result<SavedQuery, QueryError> {
    let mut queries = get_saved_queries(db)?;
    
    // Check new name doesn't exist
    if queries.iter().any(|q| q.name == new_name && q.name != old_name) {
        return Err(QueryError::new(format!("Query with name '{}' already exists", new_name)));
    }
    
    let index = queries.iter()
        .position(|q| q.name == old_name)
        .ok_or_else(|| QueryError::new(format!("Query '{}' not found", old_name)))?;
    
    queries[index].name = new_name.clone();
    let updated = queries[index].clone();
    
    let json = serde_json::to_string(&queries)
        .map_err(|e| QueryError::new(format!("Failed to serialize saved queries: {}", e)))?;
    
    db.set_setting(SAVED_QUERIES_KEY, &json)
        .map_err(|e| QueryError::new(format!("Failed to save queries: {}", e)))?;
    
    Ok(updated)
}

/// Get the most frequently used queries
pub fn get_popular_queries(db: &Database, limit: usize) -> Result<Vec<SavedQuery>, QueryError> {
    let mut queries = get_saved_queries(db)?;
    queries.sort_by(|a, b| b.use_count.cmp(&a.use_count));
    queries.truncate(limit);
    Ok(queries)
}

/// Get recently used queries
pub fn get_recent_queries(db: &Database, limit: usize) -> Result<Vec<SavedQuery>, QueryError> {
    let mut queries: Vec<_> = get_saved_queries(db)?
        .into_iter()
        .filter(|q| q.last_used_at.is_some())
        .collect();
    
    queries.sort_by(|a, b| b.last_used_at.unwrap().cmp(&a.last_used_at.unwrap()));
    queries.truncate(limit);
    Ok(queries)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_save_and_get_queries() {
        let db = Database::open_in_memory().unwrap();
        
        // Initially empty
        let queries = get_saved_queries(&db).unwrap();
        assert!(queries.is_empty());
        
        // Save a query
        let saved = save_query(&db, "Work Notes".to_string(), "tag:work".to_string()).unwrap();
        assert_eq!(saved.name, "Work Notes");
        assert_eq!(saved.query, "tag:work");
        
        // Retrieve
        let queries = get_saved_queries(&db).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].name, "Work Notes");
    }
    
    #[test]
    fn test_delete_query() {
        let db = Database::open_in_memory().unwrap();
        
        save_query(&db, "Test".to_string(), "tag:test".to_string()).unwrap();
        
        delete_query(&db, "Test").unwrap();
        
        let queries = get_saved_queries(&db).unwrap();
        assert!(queries.is_empty());
    }
    
    #[test]
    fn test_duplicate_name_error() {
        let db = Database::open_in_memory().unwrap();
        
        save_query(&db, "Test".to_string(), "tag:test".to_string()).unwrap();
        
        let result = save_query(&db, "Test".to_string(), "tag:other".to_string());
        assert!(result.is_err());
    }
    
    #[test]
    fn test_record_use() {
        let db = Database::open_in_memory().unwrap();
        
        save_query(&db, "Test".to_string(), "tag:test".to_string()).unwrap();
        
        record_query_use(&db, "Test").unwrap();
        record_query_use(&db, "Test").unwrap();
        
        let query = get_saved_query(&db, "Test").unwrap().unwrap();
        assert_eq!(query.use_count, 2);
        assert!(query.last_used_at.is_some());
    }
}
