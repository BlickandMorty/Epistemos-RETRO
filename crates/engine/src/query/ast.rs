//! Query AST (Abstract Syntax Tree)
//! 
//! Typed query algebra for structured search.
//! Composable via AND/OR/NOT combinators.
//! Based on the macOS QueryAST.swift reference implementation.

use serde::{Deserialize, Serialize};

/// The core query expression enum.
/// Represents all possible query operations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum QueryExpr {
    /// Logical AND of two expressions
    And(Box<QueryExpr>, Box<QueryExpr>),
    
    /// Logical OR of two expressions
    Or(Box<QueryExpr>, Box<QueryExpr>),
    
    /// Logical NOT of an expression
    Not(Box<QueryExpr>),
    
    /// Field filter with operator and value
    Field {
        field: String,
        op: Op,
        value: Value,
    },
    
    /// Full-text search across all fields
    FullText(String),
    
    /// Tag filter (specialized field filter)
    Tag(String),
    
    /// FTS5 match expression
    FtsMatch {
        query: String,
        scope: SearchScope,
    },
    
    /// Date field filter
    DateFilter {
        field: DateField,
        op: Op,
        value: i64, // Unix timestamp in milliseconds
    },
    
    /// Type filter for graph nodes
    TypeFilter(Vec<GraphNodeType>),
    
    /// Label contains substring
    LabelContains(String),
    
    /// Semantic similarity search
    SemanticSimilar {
        query: String,
        threshold: f32,
        limit: usize,
    },
}

/// Comparison operators for field filters
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Op {
    /// Equal (=)
    Eq,
    /// Not equal (!=)
    Neq,
    /// Less than (<)
    Lt,
    /// Greater than (>)
    Gt,
    /// Less than or equal (<=)
    Lte,
    /// Greater than or equal (>=)
    Gte,
    /// Contains (~)
    Contains,
    /// Prefix match
    Prefix,
    /// Suffix match
    Suffix,
}

impl Op {
    /// Parse an operator from a string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "=" | "==" => Some(Self::Eq),
            "!=" | "<>" => Some(Self::Neq),
            "<" => Some(Self::Lt),
            ">" => Some(Self::Gt),
            "<=" => Some(Self::Lte),
            ">=" => Some(Self::Gte),
            "~" | ":" => Some(Self::Contains),
            "^=" => Some(Self::Prefix),
            "$=" => Some(Self::Suffix),
            _ => None,
        }
    }
    
    /// Convert operator to SQL operator
    pub fn to_sql(&self) -> &'static str {
        match self {
            Self::Eq => "=",
            Self::Neq => "!=",
            Self::Lt => "<",
            Self::Gt => ">",
            Self::Lte => "<=",
            Self::Gte => ">=",
            Self::Contains => "LIKE",
            Self::Prefix => "LIKE",
            Self::Suffix => "LIKE",
        }
    }
}

/// Value types for field comparisons
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
pub enum Value {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Date(i64), // Unix timestamp in milliseconds
    Array(Vec<String>),
}

impl Value {
    /// Convert value to SQL parameter string
    pub fn to_sql_param(&self) -> String {
        match self {
            Self::String(s) => s.clone(),
            Self::Integer(i) => i.to_string(),
            Self::Float(f) => f.to_string(),
            Self::Boolean(b) => if *b { "1".to_string() } else { "0".to_string() },
            Self::Date(ts) => ts.to_string(),
            Self::Array(arr) => arr.join(","),
        }
    }
    
    /// Get the value as a string for pattern matching
    pub fn as_string(&self) -> Option<String> {
        match self {
            Self::String(s) => Some(s.clone()),
            _ => None,
        }
    }
}

/// Search scope for FTS5 queries
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum SearchScope {
    #[default]
    All,
    Title,
    Body,
    Tags,
    Pages,
    Blocks,
}

impl SearchScope {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "all" => Some(Self::All),
            "title" => Some(Self::Title),
            "body" => Some(Self::Body),
            "tags" => Some(Self::Tags),
            "pages" => Some(Self::Pages),
            "blocks" => Some(Self::Blocks),
            _ => None,
        }
    }
}

/// Date fields for filtering
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DateField {
    Created,
    Updated,
}

impl DateField {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "created" | "created_at" => Some(Self::Created),
            "updated" | "updated_at" => Some(Self::Updated),
            _ => None,
        }
    }
    
    /// Map to database column name
    pub fn to_column(&self) -> &'static str {
        match self {
            Self::Created => "created_at",
            Self::Updated => "updated_at",
        }
    }
}

/// Graph node types for type filters
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum GraphNodeType {
    Note,
    Chat,
    Idea,
    Source,
    Folder,
    Quote,
    Tag,
    Block,
}

impl GraphNodeType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "note" | "notes" => Some(Self::Note),
            "chat" | "chats" => Some(Self::Chat),
            "idea" | "ideas" => Some(Self::Idea),
            "source" | "sources" => Some(Self::Source),
            "folder" | "folders" => Some(Self::Folder),
            "quote" | "quotes" => Some(Self::Quote),
            "tag" | "tags" => Some(Self::Tag),
            "block" | "blocks" => Some(Self::Block),
            _ => None,
        }
    }
    
    pub fn to_i32(&self) -> i32 {
        match self {
            Self::Note => 0,
            Self::Chat => 1,
            Self::Idea => 2,
            Self::Source => 3,
            Self::Folder => 4,
            Self::Quote => 5,
            Self::Tag => 6,
            Self::Block => 7,
        }
    }
}

/// Ordering options for query results
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum OrderBy {
    Created { ascending: bool },
    Updated { ascending: bool },
    Relevance,
    Connections,
    Title { ascending: bool },
}

impl Default for OrderBy {
    fn default() -> Self {
        Self::Updated { ascending: false }
    }
}

/// Pagination parameters
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Pagination {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// Query result container
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QueryResult {
    pub page_ids: Vec<String>,
    pub total_count: usize,
    pub execution_time_ms: u64,
}

impl QueryResult {
    pub fn empty() -> Self {
        Self {
            page_ids: Vec::new(),
            total_count: 0,
            execution_time_ms: 0,
        }
    }
}

/// Saved query struct for persistence
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
pub struct SavedQuery {
    pub name: String,
    pub query: String,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
    pub use_count: u32,
}

/// Query parsing error
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
pub struct QueryError {
    pub message: String,
    pub position: Option<usize>,
    pub kind: QueryErrorKind,
}

impl QueryError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            position: None,
            kind: QueryErrorKind::Generic,
        }
    }
    
    pub fn with_position(mut self, pos: usize) -> Self {
        self.position = Some(pos);
        self
    }
    
    pub fn with_kind(mut self, kind: QueryErrorKind) -> Self {
        self.kind = kind;
        self
    }
}

/// Types of query errors
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub enum QueryErrorKind {
    Generic,
    UnexpectedToken,
    UnclosedQuote,
    UnclosedParen,
    InvalidOperator,
    InvalidField,
    InvalidValue,
    EmptyQuery,
}

impl std::fmt::Display for QueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(pos) = self.position {
            write!(f, "Query error at position {}: {}", pos, self.message)
        } else {
            write!(f, "Query error: {}", self.message)
        }
    }
}

impl std::error::Error for QueryError {}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_op_from_str() {
        assert_eq!(Op::from_str("="), Some(Op::Eq));
        assert_eq!(Op::from_str("!="), Some(Op::Neq));
        assert_eq!(Op::from_str("~"), Some(Op::Contains));
        assert_eq!(Op::from_str("<="), Some(Op::Lte));
        assert_eq!(Op::from_str("invalid"), None);
    }
    
    #[test]
    fn test_value_to_sql_param() {
        assert_eq!(Value::String("test".to_string()).to_sql_param(), "test");
        assert_eq!(Value::Integer(42).to_sql_param(), "42");
        assert_eq!(Value::Boolean(true).to_sql_param(), "1");
    }
    
    #[test]
    fn test_query_expr_construction() {
        let expr = QueryExpr::And(
            Box::new(QueryExpr::Tag("work".to_string())),
            Box::new(QueryExpr::Field {
                field: "created".to_string(),
                op: Op::Gt,
                value: Value::Date(1704067200000),
            }),
        );
        
        match expr {
            QueryExpr::And(left, right) => {
                assert!(matches!(*left, QueryExpr::Tag(_)));
                assert!(matches!(*right, QueryExpr::Field { .. }));
            }
            _ => panic!("Expected And expression"),
        }
    }
}
