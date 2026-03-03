//! Advanced Query System
//!
//! Structured query language for Epistemos.
//!
//! # Query Syntax
//!
//! - Field filters: `tag:work`, `created:>2024-01-01`, `title:"hello world"`
//! - Boolean operators: `AND`, `OR`, `NOT`
//! - Comparison operators: `=`, `!=`, `<`, `>`, `<=`, `>=`, `~` (contains)
//! - Grouping: `(tag:work OR tag:urgent) AND created:>2024-01-01`
//! - Tag shorthand: `#work` is equivalent to `tag:work`
//! - Full-text: just type words for FTS search
//!
//! # Examples
//!
//! ```
//! // Simple tag search
//! tag:work
//!
//! // Multiple conditions
//! tag:work AND created:>2024-01-01
//!
//! // Complex query with grouping
//! (tag:work OR tag:urgent) AND NOT is_archived:true
//!
//! // Full-text search
//! "machine learning" framework
//!
//! // Combined filters
//! title:"Project Plan" AND word_count:>500
//! ```

pub mod ast;
pub mod compiler;
pub mod parser;
pub mod runtime;
pub mod saved;
pub mod token;

// Re-export main types for convenience
pub use ast::{
    DateField, GraphNodeType, Op, OrderBy, Pagination, QueryError, QueryErrorKind, QueryExpr,
    QueryResult, SavedQuery, SearchScope, Value,
};
pub use compiler::{compile, compile_with_options, CompiledQuery, build_pages_query};
pub use parser::{parse, validate};
pub use runtime::{execute_query, QueryRuntime, QueryRuntimeExt};
pub use saved::{
    delete_query, get_popular_queries, get_recent_queries, get_saved_queries, get_saved_query,
    record_query_use, rename_query, save_query, update_query,
};

use storage::db::Database;

/// Execute a structured query and return matching page IDs
///
/// # Example
/// ```
/// use engine::query;
///
/// let result = query::execute(&db, "tag:work AND created:>2024-01-01")?;
/// println!("Found {} pages in {}ms", result.total_count, result.execution_time_ms);
/// ```
pub fn execute(db: &Database, query_str: &str) -> Result<QueryResult, QueryError> {
    runtime::execute_query(db, query_str)
}

/// Quick validation of query syntax
///
/// Returns Ok(()) if the query is valid, or a QueryError with details.
pub fn check(query_str: &str) -> Result<(), QueryError> {
    validate(query_str)
}

/// Parse and compile a query for inspection
///
/// Useful for debugging or building custom query UIs.
pub fn analyze(query_str: &str) -> Result<(QueryExpr, CompiledQuery), QueryError> {
    let expr = parse(query_str)?;
    let compiled = compile(&expr)?;
    Ok((expr, compiled))
}
