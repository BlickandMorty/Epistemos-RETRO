//! Query Runtime
//!
//! Executes compiled queries against the database.
//! Returns ranked results with pagination support.

use super::ast::*;
use super::compiler::{CompiledQuery, build_pages_query};
use storage::db::Database;
use storage::types::Page;
use rusqlite::params;
use std::time::Instant;

/// SQL parameter types for binding to queries
#[derive(Debug, Clone)]
pub enum SqlParam {
    String(String),
    Integer(i64),
    Float(f64),
}

impl SqlParam {
    /// Convert from serde_json::Value
    fn from_json(value: &serde_json::Value) -> Option<Self> {
        match value {
            serde_json::Value::String(s) => Some(Self::String(s.clone())),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Some(Self::Integer(i))
                } else if let Some(f) = n.as_f64() {
                    Some(Self::Float(f))
                } else {
                    None
                }
            }
            serde_json::Value::Bool(b) => Some(Self::Integer(if *b { 1 } else { 0 })),
            _ => None,
        }
    }
}

/// Bind a parameter to rusqlite
fn bind_param<'a>(param: &'a SqlParam) -> &'a dyn rusqlite::ToSql {
    match param {
        SqlParam::String(s) => s as &dyn rusqlite::ToSql,
        SqlParam::Integer(i) => i as &dyn rusqlite::ToSql,
        SqlParam::Float(f) => f as &dyn rusqlite::ToSql,
    }
}

/// Query execution engine
pub struct QueryRuntime<'a> {
    db: &'a Database,
}

impl<'a> QueryRuntime<'a> {
    /// Create a new query runtime
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }
    
    /// Execute a compiled query and return page IDs
    pub fn execute(&self, compiled: &CompiledQuery) -> Result<QueryResult, QueryError> {
        let start = Instant::now();
        
        // If using FTS5, we need a different query approach
        let page_ids = if compiled.uses_fts {
            self.execute_fts_query(compiled)?
        } else {
            self.execute_standard_query(compiled)?
        };
        
        let total_count = page_ids.len();
        
        // Apply pagination
        let paginated_ids = self.apply_pagination(page_ids, &compiled.pagination);
        
        let elapsed = start.elapsed().as_millis() as u64;
        
        Ok(QueryResult {
            page_ids: paginated_ids,
            total_count,
            execution_time_ms: elapsed,
        })
    }
    
    /// Execute a standard SQL query
    fn execute_standard_query(&self, compiled: &CompiledQuery) -> Result<Vec<String>, QueryError> {
        let base_sql = build_pages_query(false);
        let sql = compiled.build_sql(&base_sql);
        
        // Convert params
        let sql_params: Vec<SqlParam> = compiled.params
            .iter()
            .filter_map(|p| SqlParam::from_json(p))
            .collect();
        
        let conn = self.db.conn();
        let mut stmt = conn.prepare(&sql).map_err(|e| {
            QueryError::new(format!("Failed to prepare query: {}", e))
        })?;
        
        // Bind parameters
        let params_refs: Vec<&dyn rusqlite::ToSql> = sql_params
            .iter()
            .map(|p| bind_param(p))
            .collect();
        
        let page_ids: Result<Vec<String>, _> = stmt
            .query_map(&params_refs[..], |row| {
                let id: String = row.get("id")?;
                Ok(id)
            })
            .map_err(|e| QueryError::new(format!("Query execution failed: {}", e)))?
            .collect();
        
        page_ids.map_err(|e| QueryError::new(format!("Row mapping failed: {}", e)))
    }
    
    /// Execute an FTS5-enhanced query
    fn execute_fts_query(&self, compiled: &CompiledQuery) -> Result<Vec<String>, QueryError> {
        let fts_query = compiled.fts_query.as_deref().unwrap_or("");
        
        // First, get matching page IDs from FTS5
        let fts_page_ids = if !fts_query.is_empty() {
            self.get_fts_matches(fts_query, compiled.pagination.limit.unwrap_or(100))?
        } else {
            Vec::new()
        };
        
        // If we have additional filters, apply them
        if compiled.where_clause != "1=1" && !compiled.where_clause.is_empty() {
            self.execute_filtered_fts_query(compiled, &fts_page_ids)
        } else {
            Ok(fts_page_ids)
        }
    }
    
    /// Get page IDs from FTS5 search
    fn get_fts_matches(&self, query: &str, limit: usize) -> Result<Vec<String>, QueryError> {
        // Sanitize and build FTS5 query
        let sanitized = self.sanitize_fts5_query(query);
        
        if sanitized.is_empty() {
            return Ok(Vec::new());
        }
        
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT page_id FROM search_index WHERE search_index MATCH ?1 ORDER BY rank LIMIT ?2"
        ).map_err(|e| QueryError::new(format!("FTS5 prepare failed: {}", e)))?;
        
        let ids: Result<Vec<String>, _> = stmt
            .query_map(params![sanitized, limit as i64], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| QueryError::new(format!("FTS5 query failed: {}", e)))?
            .collect();
        
        ids.map_err(|e| QueryError::new(format!("FTS5 row mapping failed: {}", e)))
    }
    
    /// Execute query with FTS results as filter
    fn execute_filtered_fts_query(
        &self,
        compiled: &CompiledQuery,
        fts_page_ids: &[String],
    ) -> Result<Vec<String>, QueryError> {
        if fts_page_ids.is_empty() {
            return Ok(Vec::new());
        }
        
        // Build query with FTS results as an IN clause
        let placeholders: Vec<String> = (1..=fts_page_ids.len())
            .map(|i| format!("?{}", i))
            .collect();
        
        let base_sql = build_pages_query(false);
        let where_clause = if compiled.where_clause != "1=1" {
            format!(
                "p.id IN ({}) AND {}",
                placeholders.join(", "),
                compiled.where_clause
            )
        } else {
            format!("p.id IN ({})", placeholders.join(", "))
        };
        
        let mut sql = base_sql;
        sql.push_str(" WHERE ");
        sql.push_str(&where_clause);
        
        if let Some(ref order) = compiled.order_by {
            sql.push_str(" ORDER BY ");
            sql.push_str(order);
        }
        
        if let Some(limit) = compiled.pagination.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        
        let conn = self.db.conn();
        let mut stmt = conn.prepare(&sql).map_err(|e| {
            QueryError::new(format!("Failed to prepare filtered query: {}", e))
        })?;
        
        // Combine FTS IDs with compiled params
        let mut all_params: Vec<SqlParam> = fts_page_ids
            .iter()
            .map(|s| SqlParam::String(s.clone()))
            .collect();
        
        let compiled_sql_params: Vec<SqlParam> = compiled.params
            .iter()
            .filter_map(|p| SqlParam::from_json(p))
            .collect();
        all_params.extend(compiled_sql_params);
        
        let params_refs: Vec<&dyn rusqlite::ToSql> = all_params
            .iter()
            .map(|p| bind_param(p))
            .collect();
        
        let page_ids: Result<Vec<String>, _> = stmt
            .query_map(&params_refs[..], |row| {
                row.get::<_, String>("id")
            })
            .map_err(|e| QueryError::new(format!("Filtered query failed: {}", e)))?
            .collect();
        
        page_ids.map_err(|e| QueryError::new(format!("Row mapping failed: {}", e)))
    }
    
    /// Apply pagination to results
    fn apply_pagination(&self, mut ids: Vec<String>, pagination: &Pagination) -> Vec<String> {
        // Apply offset
        if let Some(offset) = pagination.offset {
            if offset < ids.len() {
                ids = ids.split_off(offset);
            } else {
                return Vec::new();
            }
        }
        
        // Apply limit
        if let Some(limit) = pagination.limit {
            if ids.len() > limit {
                ids.truncate(limit);
            }
        }
        
        ids
    }
    
    /// Sanitize user input for FTS5 MATCH query
    fn sanitize_fts5_query(&self, query: &str) -> String {
        let tokens: Vec<&str> = query
            .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
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
    
    /// Execute a raw query expression (parse + compile + execute)
    pub fn query(&self, query_str: &str) -> Result<QueryResult, QueryError> {
        let expr = super::parser::parse(query_str)?;
        let compiled = super::compiler::compile(&expr)?;
        self.execute(&compiled)
    }
    
    /// Execute and fetch full Page objects
    pub fn query_pages(&self, query_str: &str) -> Result<Vec<Page>, QueryError> {
        let expr = super::parser::parse(query_str)?;
        self.execute_pages(&expr, None, None)
    }
    
    /// Execute a query expression and return full Page objects
    pub fn execute_pages(
        &self,
        expr: &QueryExpr,
        order_by: Option<OrderBy>,
        pagination: Option<Pagination>,
    ) -> Result<Vec<Page>, QueryError> {
        let compiled = super::compiler::compile_with_options(expr, order_by, pagination)?;
        
        let base_sql = build_pages_query(compiled.uses_fts);
        let sql = compiled.build_sql(&base_sql);
        
        // Convert params
        let sql_params: Vec<SqlParam> = compiled.params
            .iter()
            .filter_map(|p| SqlParam::from_json(p))
            .collect();
        
        let conn = self.db.conn();
        let mut stmt = conn.prepare(&sql).map_err(|e| {
            QueryError::new(format!("Failed to prepare query: {}", e))
        })?;
        
        let params_refs: Vec<&dyn rusqlite::ToSql> = sql_params
            .iter()
            .map(|p| bind_param(p))
            .collect();
        
        let pages: Result<Vec<Page>, _> = stmt
            .query_map(&params_refs[..], storage::db::row_to_page)
            .map_err(|e| QueryError::new(format!("Query failed: {}", e)))?
            .collect();
        
        pages.map_err(|e| QueryError::new(format!("Row mapping failed: {}", e)))
    }
    
    /// Validate a query string
    pub fn validate(&self, query_str: &str) -> Result<(), QueryError> {
        super::parser::validate(query_str)
    }
}

/// Extension trait for Database to provide query runtime
pub trait QueryRuntimeExt {
    fn query_runtime(&self) -> QueryRuntime;
}

impl QueryRuntimeExt for Database {
    fn query_runtime(&self) -> QueryRuntime {
        QueryRuntime::new(self)
    }
}

/// Convenience function to execute a query
pub fn execute_query(db: &Database, query_str: &str) -> Result<QueryResult, QueryError> {
    let runtime = QueryRuntime::new(db);
    runtime.query(query_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_sanitize_fts5_query() {
        let db = Database::open_in_memory().unwrap();
        let runtime = QueryRuntime::new(&db);
        
        let result = runtime.sanitize_fts5_query("hello world");
        assert!(result.contains("\"hello\""));
        assert!(result.contains("\"world\""));
    }
    
    #[test]
    fn test_pagination() {
        let db = Database::open_in_memory().unwrap();
        let runtime = QueryRuntime::new(&db);
        
        let ids = vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string()];
        
        let paginated = runtime.apply_pagination(ids.clone(), &Pagination { limit: Some(2), offset: Some(0) });
        assert_eq!(paginated.len(), 2);
        assert_eq!(paginated[0], "a");
        
        let paginated = runtime.apply_pagination(ids.clone(), &Pagination { limit: Some(2), offset: Some(1) });
        assert_eq!(paginated.len(), 2);
        assert_eq!(paginated[0], "b");
    }
}
