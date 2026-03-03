//! Query Compiler
//!
//! Compiles QueryExpr AST into SQL WHERE clauses.
//! Handles: index selection, predicate pushdown, type-safe parameter binding.

use super::ast::*;

/// Compiled SQL query with parameters
#[derive(Debug, Clone, PartialEq)]
pub struct CompiledQuery {
    /// The WHERE clause (without the "WHERE" keyword)
    pub where_clause: String,
    /// Parameter values to bind
    pub params: Vec<serde_json::Value>,
    /// Whether this query uses FTS5
    pub uses_fts: bool,
    /// FTS5 query if applicable
    pub fts_query: Option<String>,
    /// Order by clause
    pub order_by: Option<String>,
    /// Pagination
    pub pagination: Pagination,
}

impl CompiledQuery {
    /// Create an empty compiled query
    pub fn empty() -> Self {
        Self {
            where_clause: "1=1".to_string(),
            params: Vec::new(),
            uses_fts: false,
            fts_query: None,
            order_by: None,
            pagination: Pagination::default(),
        }
    }
    
    /// Build the full SQL query
    pub fn build_sql(&self, base_query: &str) -> String {
        let mut sql = base_query.to_string();
        
        if !self.where_clause.is_empty() && self.where_clause != "1=1" {
            sql.push_str(" WHERE ");
            sql.push_str(&self.where_clause);
        }
        
        if let Some(ref order) = self.order_by {
            sql.push_str(" ORDER BY ");
            sql.push_str(order);
        }
        
        if let Some(limit) = self.pagination.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        
        if let Some(offset) = self.pagination.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
        
        sql
    }
}

/// Query compiler state
pub struct Compiler {
    param_index: usize,
    param_values: Vec<serde_json::Value>,
    uses_fts: bool,
    fts_query: Option<String>,
    fts_params: Vec<String>,
    order_by: Option<OrderBy>,
    pagination: Pagination,
}

impl Compiler {
    /// Create a new compiler
    pub fn new() -> Self {
        Self {
            param_index: 0,
            param_values: Vec::new(),
            uses_fts: false,
            fts_query: None,
            fts_params: Vec::new(),
            order_by: None,
            pagination: Pagination::default(),
        }
    }
    
    /// Add a parameter and return its placeholder
    fn add_param(&mut self, value: impl Into<serde_json::Value>) -> String {
        self.param_index += 1;
        self.param_values.push(value.into());
        format!("?{}", self.param_index)
    }
    
    /// Compile a query expression
    pub fn compile(&mut self, expr: &QueryExpr) -> Result<CompiledQuery, QueryError> {
        let where_clause = self.compile_expr(expr)?;
        
        // Build FTS query if needed
        let fts_query = if self.uses_fts && !self.fts_params.is_empty() {
            Some(self.fts_params.join(" "))
        } else {
            None
        };
        
        // Build ORDER BY
        let order_by = self.order_by.as_ref().map(|o| self.compile_order_by(o));
        
        Ok(CompiledQuery {
            where_clause,
            params: self.param_values.clone(),
            uses_fts: self.uses_fts,
            fts_query,
            order_by,
            pagination: self.pagination.clone(),
        })
    }
    
    /// Compile an expression
    fn compile_expr(&mut self, expr: &QueryExpr) -> Result<String, QueryError> {
        match expr {
            QueryExpr::And(left, right) => {
                let l = self.compile_expr(left)?;
                let r = self.compile_expr(right)?;
                Ok(format!("({} AND {})", l, r))
            }
            QueryExpr::Or(left, right) => {
                let l = self.compile_expr(left)?;
                let r = self.compile_expr(right)?;
                Ok(format!("({} OR {})", l, r))
            }
            QueryExpr::Not(inner) => {
                let inner_sql = self.compile_expr(inner)?;
                Ok(format!("NOT ({})", inner_sql))
            }
            QueryExpr::Field { field, op, value } => {
                self.compile_field_filter(field, *op, value)
            }
            QueryExpr::FullText(text) => {
                self.compile_fulltext(text)
            }
            QueryExpr::Tag(tag) => {
                self.compile_tag_filter(tag)
            }
            QueryExpr::FtsMatch { query, scope } => {
                self.compile_fts_match(query, *scope)
            }
            QueryExpr::DateFilter { field, op, value } => {
                self.compile_date_filter(*field, *op, *value)
            }
            QueryExpr::TypeFilter(types) => {
                self.compile_type_filter(types)
            }
            QueryExpr::LabelContains(text) => {
                self.compile_label_contains(text)
            }
            QueryExpr::SemanticSimilar { .. } => {
                // Semantic search is handled at runtime, not SQL compile time
                Ok("1=1".to_string())
            }
        }
    }
    
    /// Compile a field filter
    fn compile_field_filter(
        &mut self,
        field: &str,
        op: Op,
        value: &Value,
    ) -> Result<String, QueryError> {
        let column = self.field_to_column(field);
        let placeholder = self.value_to_placeholder(value, op)?;
        
        // Handle JSON array fields (tags)
        if field == "tags" {
            return self.compile_tags_filter(op, value);
        }
        
        let sql_op = match op {
            Op::Contains => {
                // For LIKE, we need to wrap the value with wildcards
                if let Value::String(s) = value {
                    let pattern = format!("%{}%", s);
                    let ph = self.add_param(pattern);
                    return Ok(format!("{} LIKE {}", column, ph));
                }
                "LIKE"
            }
            Op::Prefix => {
                if let Value::String(s) = value {
                    let pattern = format!("{}%", s);
                    let ph = self.add_param(pattern);
                    return Ok(format!("{} LIKE {}", column, ph));
                }
                "LIKE"
            }
            Op::Suffix => {
                if let Value::String(s) = value {
                    let pattern = format!("%{}", s);
                    let ph = self.add_param(pattern);
                    return Ok(format!("{} LIKE {}", column, ph));
                }
                "LIKE"
            }
            _ => op.to_sql(),
        };
        
        Ok(format!("{} {} {}", column, sql_op, placeholder))
    }
    
    /// Map field name to database column
    fn field_to_column(&self, field: &str) -> String {
        let field_lower = field.to_lowercase();
        match field_lower.as_str() {
            "title" => "p.title".to_string(),
            "body" | "content" => "pb.body".to_string(),
            "tags" => "p.tags_json".to_string(),
            "created" | "created_at" => "p.created_at".to_string(),
            "updated" | "updated_at" => "p.updated_at".to_string(),
            "word_count" => "p.word_count".to_string(),
            "is_pinned" => "p.is_pinned".to_string(),
            "is_archived" => "p.is_archived".to_string(),
            "is_favorite" => "p.is_favorite".to_string(),
            "research_stage" => "p.research_stage".to_string(),
            "summary" => "p.summary".to_string(),
            "folder_id" => "p.folder_id".to_string(),
            "parent_page_id" => "p.parent_page_id".to_string(),
            "id" => "p.id".to_string(),
            _ => format!("p.{}", field_lower),
        }
    }
    
    /// Convert a value to SQL placeholder
    fn value_to_placeholder(&mut self, value: &Value, op: Op) -> Result<String, QueryError> {
        match value {
            Value::String(s) => {
                // For LIKE operators, value is already handled
                if matches!(op, Op::Contains | Op::Prefix | Op::Suffix) {
                    Ok(self.add_param(s.clone()))
                } else {
                    Ok(self.add_param(s.clone()))
                }
            }
            Value::Integer(i) => Ok(self.add_param(*i)),
            Value::Float(f) => Ok(self.add_param(*f)),
            Value::Boolean(b) => Ok(self.add_param(*b as i64)),
            Value::Date(ts) => Ok(self.add_param(*ts)),
            Value::Array(arr) => {
                // For IN clauses
                let placeholders: Vec<String> = arr
                    .iter()
                    .map(|s| self.add_param(s.clone()))
                    .collect();
                Ok(format!("({})", placeholders.join(", ")))
            }
        }
    }
    
    /// Compile tags filter (JSON array search)
    fn compile_tags_filter(&mut self, op: Op, value: &Value) -> Result<String, QueryError> {
        match (op, value) {
            (Op::Eq | Op::Contains, Value::String(tag)) => {
                // JSON contains check
                let pattern = format!("%\"{}\"%", tag);
                let ph = self.add_param(pattern);
                Ok(format!("p.tags_json LIKE {}", ph))
            }
            (Op::Eq, Value::Array(tags)) if tags.len() == 1 => {
                let pattern = format!("%\"{}\"%", tags[0]);
                let ph = self.add_param(pattern);
                Ok(format!("p.tags_json LIKE {}", ph))
            }
            _ => {
                // Fall back to string comparison
                let ph = self.add_param(value.to_sql_param());
                Ok(format!("p.tags_json = {}", ph))
            }
        }
    }
    
    /// Compile full-text search
    fn compile_fulltext(&mut self, text: &str) -> Result<String, QueryError> {
        self.uses_fts = true;
        self.fts_params.push(text.to_string());
        
        // Return a condition that will be satisfied by the FTS5 join
        // The actual FTS filtering happens via the fts_query
        Ok("1=1".to_string())
    }
    
    /// Compile tag filter
    fn compile_tag_filter(&mut self, tag: &str) -> Result<String, QueryError> {
        // Tags are stored as JSON array
        let pattern = format!("%\"{}\"%", tag);
        let ph = self.add_param(pattern);
        Ok(format!("p.tags_json LIKE {}", ph))
    }
    
    /// Compile FTS5 match
    fn compile_fts_match(&mut self, query: &str, _scope: SearchScope) -> Result<String, QueryError> {
        self.uses_fts = true;
        self.fts_params.push(query.to_string());
        
        // The FTS5 filtering is done via the virtual table
        Ok("si.page_id IS NOT NULL".to_string())
    }
    
    /// Compile date filter
    fn compile_date_filter(&mut self, field: DateField, op: Op, value: i64) -> Result<String, QueryError> {
        let column = field.to_column();
        let sql_op = op.to_sql();
        let ph = self.add_param(value);
        
        Ok(format!("p.{} {} {}", column, sql_op, ph))
    }
    
    /// Compile type filter (for graph nodes)
    fn compile_type_filter(&mut self, types: &[GraphNodeType]) -> Result<String, QueryError> {
        if types.is_empty() {
            return Ok("1=1".to_string());
        }
        
        if types.len() == 1 {
            let ph = self.add_param(types[0].to_i32());
            Ok(format!("gn.node_type = {}", ph))
        } else {
            let placeholders: Vec<String> = types
                .iter()
                .map(|t| self.add_param(t.to_i32()))
                .collect();
            Ok(format!("gn.node_type IN ({})", placeholders.join(", ")))
        }
    }
    
    /// Compile label contains filter
    fn compile_label_contains(&mut self, text: &str) -> Result<String, QueryError> {
        let pattern = format!("%{}%", text);
        let ph = self.add_param(pattern);
        Ok(format!("(p.title LIKE {} OR p.summary LIKE {})", ph, ph))
    }
    
    /// Compile ORDER BY clause
    fn compile_order_by(&self, order_by: &OrderBy) -> String {
        match order_by {
            OrderBy::Created { ascending } => {
                format!("p.created_at {}", if *ascending { "ASC" } else { "DESC" })
            }
            OrderBy::Updated { ascending } => {
                format!("p.updated_at {}", if *ascending { "ASC" } else { "DESC" })
            }
            OrderBy::Title { ascending } => {
                format!("p.title COLLATE NOCASE {}", if *ascending { "ASC" } else { "DESC" })
            }
            OrderBy::Relevance => {
                // Requires FTS5
                "rank".to_string()
            }
            OrderBy::Connections => {
                // Requires graph join
                "connection_count DESC".to_string()
            }
        }
    }
    
    /// Set the ORDER BY for the query
    pub fn with_order_by(mut self, order_by: OrderBy) -> Self {
        self.order_by = Some(order_by);
        self
    }
    
    /// Set pagination
    pub fn with_pagination(mut self, pagination: Pagination) -> Self {
        self.pagination = pagination;
        self
    }
}

impl Default for Compiler {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function to compile a query expression
pub fn compile(expr: &QueryExpr) -> Result<CompiledQuery, QueryError> {
    let mut compiler = Compiler::new();
    compiler.compile(expr)
}

/// Compile with ordering
pub fn compile_with_options(
    expr: &QueryExpr,
    order_by: Option<OrderBy>,
    pagination: Option<Pagination>,
) -> Result<CompiledQuery, QueryError> {
    let mut compiler = Compiler::new();
    
    if let Some(order) = order_by {
        compiler.order_by = Some(order);
    }
    
    if let Some(page) = pagination {
        compiler.pagination = page;
    }
    
    compiler.compile(expr)
}

/// Build the base query for pages
pub fn build_pages_query(include_fts: bool) -> String {
    if include_fts {
        r#"SELECT DISTINCT p.id, p.title, p.summary, p.emoji, p.research_stage, p.tags_json,
            p.word_count, p.is_pinned, p.is_archived, p.is_favorite, p.is_journal,
            p.is_locked, p.sort_order, p.journal_date, p.front_matter_data, p.ideas_data,
            p.needs_vault_sync, p.last_synced_body_hash, p.last_synced_at,
            p.file_path, p.subfolder, p.parent_page_id, p.folder_id, p.template_id,
            p.created_at, p.updated_at
         FROM pages p
         LEFT JOIN page_bodies pb ON p.id = pb.page_id
         LEFT JOIN search_index si ON p.id = si.page_id"#.to_string()
    } else {
        r#"SELECT DISTINCT p.id, p.title, p.summary, p.emoji, p.research_stage, p.tags_json,
            p.word_count, p.is_pinned, p.is_archived, p.is_favorite, p.is_journal,
            p.is_locked, p.sort_order, p.journal_date, p.front_matter_data, p.ideas_data,
            p.needs_vault_sync, p.last_synced_body_hash, p.last_synced_at,
            p.file_path, p.subfolder, p.parent_page_id, p.folder_id, p.template_id,
            p.created_at, p.updated_at
         FROM pages p
         LEFT JOIN page_bodies pb ON p.id = pb.page_id"#.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::parser;
    
    #[test]
    fn test_compile_simple_field() {
        let expr = QueryExpr::Field {
            field: "title".to_string(),
            op: Op::Contains,
            value: Value::String("hello".to_string()),
        };
        
        let compiled = compile(&expr).unwrap();
        assert!(compiled.where_clause.contains("p.title"));
        assert!(compiled.where_clause.contains("LIKE"));
    }
    
    #[test]
    fn test_compile_and() {
        let expr = parser::parse("tag:work AND created:>1000").unwrap();
        let compiled = compile(&expr).unwrap();
        
        assert!(compiled.where_clause.contains("AND"));
    }
    
    #[test]
    fn test_compile_tag() {
        let expr = QueryExpr::Tag("work".to_string());
        let compiled = compile(&expr).unwrap();
        
        assert!(compiled.where_clause.contains("tags_json"));
        assert!(compiled.where_clause.contains("LIKE"));
    }
    
    #[test]
    fn test_compile_fulltext() {
        let expr = QueryExpr::FullText("machine learning".to_string());
        let compiled = compile(&expr).unwrap();
        
        assert!(compiled.uses_fts);
        assert!(compiled.fts_query.is_some());
    }
    
    #[test]
    fn test_build_sql() {
        let expr = parser::parse("tag:work").unwrap();
        let compiled = compile(&expr).unwrap();
        
        let sql = compiled.build_sql(&build_pages_query(false));
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("FROM pages"));
        assert!(sql.contains("WHERE"));
    }
}
