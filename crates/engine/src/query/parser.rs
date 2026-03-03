//! Query Parser
//!
//! Recursive descent parser for the structured query language.
//! Converts tokens into a QueryExpr AST.
//!
//! Grammar:
//!   query     = expr (AND expr | OR expr)*
//!   expr      = NOT expr | atom
//!   atom      = field_filter | tag_filter | fts | group | literal
//!   field_filter = field operator value
//!   tag_filter   = tag string
//!   fts          = string
//!   group        = "(" query ")"
//!   literal      = string | number | boolean
//!   field        = identifier ":"
//!   operator     = "=" | "!=" | "<" | ">" | "<=" | ">=" | "~"
//!   value        = string | number | date | boolean

use super::ast::*;
use super::token::{Token, Tokenizer};

/// Parser state
pub struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    /// Create a new parser from a query string
    pub fn new(input: &str) -> Result<Self, QueryError> {
        let mut tokenizer = Tokenizer::new(input);
        let tokens = tokenizer.tokenize()?;
        Ok(Self {
            tokens,
            position: 0,
        })
    }
    
    /// Create a parser from pre-tokenized tokens
    pub fn from_tokens(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            position: 0,
        }
    }
    
    /// Get the current token
    fn current(&self) -> &Token {
        self.tokens.get(self.position).unwrap_or(&Token::EOF)
    }
    
    /// Advance to the next token
    fn advance(&mut self) {
        if self.position < self.tokens.len() - 1 {
            self.position += 1;
        }
    }
    
    /// Check if current token matches expected
    fn check(&self, expected: &Token) -> bool {
        std::mem::discriminant(self.current()) == std::mem::discriminant(expected)
    }
    
    /// Expect a specific token or return error
    fn expect(&mut self, expected: Token) -> Result<(), QueryError> {
        if self.check(&expected) {
            self.advance();
            Ok(())
        } else {
            Err(QueryError::new(format!(
                "Expected {:?}, got {:?}",
                expected,
                self.current()
            ))
            .with_kind(QueryErrorKind::UnexpectedToken))
        }
    }
    
    /// Parse the full query (entry point)
    pub fn parse(&mut self) -> Result<QueryExpr, QueryError> {
        let expr = self.parse_or_expr()?;
        
        // Ensure we consumed all tokens
        if !self.check(&Token::EOF) {
            return Err(QueryError::new(format!(
                "Unexpected token: {:?}",
                self.current()
            ))
            .with_kind(QueryErrorKind::UnexpectedToken));
        }
        
        Ok(expr)
    }
    
    /// Parse OR expressions (lowest precedence)
    /// or_expr = and_expr (OR and_expr)*
    fn parse_or_expr(&mut self) -> Result<QueryExpr, QueryError> {
        let mut left = self.parse_and_expr()?;
        
        while self.check(&Token::Or) {
            self.advance(); // consume OR
            let right = self.parse_and_expr()?;
            left = QueryExpr::Or(Box::new(left), Box::new(right));
        }
        
        Ok(left)
    }
    
    /// Parse AND expressions
    /// and_expr = not_expr (AND not_expr)*
    fn parse_and_expr(&mut self) -> Result<QueryExpr, QueryError> {
        let mut left = self.parse_not_expr()?;
        
        // Also handle implicit AND (two atoms next to each other)
        while self.check(&Token::And) || self.should_implicit_and() {
            if self.check(&Token::And) {
                self.advance(); // consume AND
            }
            let right = self.parse_not_expr()?;
            left = QueryExpr::And(Box::new(left), Box::new(right));
        }
        
        Ok(left)
    }
    
    /// Check if we should apply implicit AND
    fn should_implicit_and(&self) -> bool {
        // Implicit AND between two atoms
        matches!(
            (self.current(), self.peek_next()),
            (Token::String(_), Token::String(_))
                | (Token::String(_), Token::Field(_))
                | (Token::String(_), Token::Identifier(_))
                | (Token::RParen, Token::String(_))
                | (Token::RParen, Token::Field(_))
                | (Token::RParen, Token::Identifier(_))
                | (Token::RParen, Token::LParen)
                | (Token::String(_), Token::LParen)
        )
    }
    
    /// Peek at next token (skipping EOF)
    fn peek_next(&self) -> &Token {
        self.tokens.get(self.position + 1).unwrap_or(&Token::EOF)
    }
    
    /// Parse NOT expressions
    /// not_expr = NOT not_expr | primary
    fn parse_not_expr(&mut self) -> Result<QueryExpr, QueryError> {
        if self.check(&Token::Not) {
            self.advance(); // consume NOT
            let inner = self.parse_not_expr()?;
            Ok(QueryExpr::Not(Box::new(inner)))
        } else {
            self.parse_primary()
        }
    }
    
    /// Parse primary expressions (atoms)
    fn parse_primary(&mut self) -> Result<QueryExpr, QueryError> {
        match self.current().clone() {
            Token::LParen => self.parse_group(),
            Token::Field(field) => self.parse_field_filter(field),
            Token::String(s) => self.parse_string_atom(s),
            Token::Identifier(s) => self.parse_identifier_atom(s),
            Token::Number(n) => {
                self.advance();
                Ok(QueryExpr::FullText(n.to_string()))
            }
            Token::Boolean(b) => {
                self.advance();
                Ok(QueryExpr::FullText(b.to_string()))
            }
            _ => Err(QueryError::new(format!(
                "Unexpected token: {:?}",
                self.current()
            ))
            .with_kind(QueryErrorKind::UnexpectedToken)),
        }
    }
    
    /// Parse a grouped expression: (query)
    fn parse_group(&mut self) -> Result<QueryExpr, QueryError> {
        self.expect(Token::LParen)?;
        let inner = self.parse_or_expr()?;
        self.expect(Token::RParen)?;
        Ok(inner)
    }
    
    /// Parse a field filter: field:value or field>value, etc.
    fn parse_field_filter(&mut self, field: String) -> Result<QueryExpr, QueryError> {
        self.advance(); // consume field token
        
        // Check for operator (if not present, use Contains)
        let op = if let Token::Operator(op) = self.current() {
            let op = *op;
            self.advance();
            op
        } else {
            Op::Contains
        };
        
        // Parse the value
        let value = self.parse_value()?;
        
        // Special handling for known fields
        match field.to_lowercase().as_str() {
            "tag" | "tags" => {
                if let Some(tag) = value.as_string() {
                    Ok(QueryExpr::Tag(tag))
                } else {
                    Ok(QueryExpr::Field { field, op, value })
                }
            }
            "created" | "updated" | "created_at" | "updated_at" => {
                // Parse as date filter
                if let Some(timestamp) = self.parse_date_value(&value) {
                    let date_field = DateField::from_str(&field).unwrap_or(DateField::Created);
                    Ok(QueryExpr::DateFilter {
                        field: date_field,
                        op,
                        value: timestamp,
                    })
                } else {
                    Ok(QueryExpr::Field { field, op, value })
                }
            }
            "type" => {
                if let Some(type_str) = value.as_string() {
                    let types: Vec<GraphNodeType> = type_str
                        .split(',')
                        .filter_map(|s| GraphNodeType::from_str(s.trim()))
                        .collect();
                    if !types.is_empty() {
                        Ok(QueryExpr::TypeFilter(types))
                    } else {
                        Ok(QueryExpr::Field { field, op, value })
                    }
                } else {
                    Ok(QueryExpr::Field { field, op, value })
                }
            }
            _ => Ok(QueryExpr::Field { field, op, value }),
        }
    }
    
    /// Parse a value
    fn parse_value(&mut self) -> Result<Value, QueryError> {
        match self.current().clone() {
            Token::String(s) => {
                self.advance();
                Ok(Value::String(s))
            }
            Token::Number(n) => {
                self.advance();
                if n.fract() == 0.0 {
                    Ok(Value::Integer(n as i64))
                } else {
                    Ok(Value::Float(n))
                }
            }
            Token::Boolean(b) => {
                self.advance();
                Ok(Value::Boolean(b))
            }
            Token::Identifier(s) => {
                self.advance();
                // Check if it looks like a date
                if let Some(ts) = self.parse_date_string(&s) {
                    Ok(Value::Date(ts))
                } else {
                    Ok(Value::String(s))
                }
            }
            _ => Err(QueryError::new(format!(
                "Expected value, got {:?}",
                self.current()
            ))
            .with_kind(QueryErrorKind::InvalidValue)),
        }
    }
    
    /// Parse a date value
    fn parse_date_value(&self, value: &Value) -> Option<i64> {
        match value {
            Value::String(s) => self.parse_date_string(s),
            Value::Integer(ts) => Some(*ts),
            _ => None,
        }
    }
    
    /// Parse various date string formats
    fn parse_date_string(&self, s: &str) -> Option<i64> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_millis() as i64;
        
        // Handle relative dates
        match s.to_lowercase().as_str() {
            "today" => {
                let day_start = (now / 86_400_000) * 86_400_000;
                Some(day_start)
            }
            "yesterday" => {
                let day_start = ((now / 86_400_000) - 1) * 86_400_000;
                Some(day_start)
            }
            "last_week" | "past_week" => {
                Some(now - 7 * 86_400_000)
            }
            "last_month" | "past_month" => {
                Some(now - 30 * 86_400_000)
            }
            _ => {
                // Try ISO date format: 2024-01-01
                if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    let datetime = date.and_hms_opt(0, 0, 0)?;
                    let timestamp = datetime.and_local_timezone(chrono::Utc).single()?.timestamp_millis();
                    return Some(timestamp);
                }
                // Try other formats
                if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y/%m/%d") {
                    let datetime = date.and_hms_opt(0, 0, 0)?;
                    let timestamp = datetime.and_local_timezone(chrono::Utc).single()?.timestamp_millis();
                    return Some(timestamp);
                }
                None
            }
        }
    }
    
    /// Parse a string atom (full-text search or tag)
    fn parse_string_atom(&mut self, s: String) -> Result<QueryExpr, QueryError> {
        self.advance();
        
        // Check for special prefixes
        if s.starts_with('#') {
            return Ok(QueryExpr::Tag(s[1..].to_string()));
        }
        
        if s.starts_with('@') {
            return Ok(QueryExpr::Field {
                field: "mention".to_string(),
                op: Op::Contains,
                value: Value::String(s[1..].to_string()),
            });
        }
        
        // Default to full-text search
        Ok(QueryExpr::FullText(s))
    }
    
    /// Parse an identifier atom
    fn parse_identifier_atom(&mut self, s: String) -> Result<QueryExpr, QueryError> {
        self.advance();
        
        // Check if it looks like a boolean operator was intended
        match s.to_lowercase().as_str() {
            "and" | "or" | "not" => {
                return Err(QueryError::new(format!(
                    "Unexpected boolean operator '{}' at this position",
                    s
                ))
                .with_kind(QueryErrorKind::UnexpectedToken));
            }
            _ => {}
        }
        
        // Check for special prefixes
        if s.starts_with('#') {
            return Ok(QueryExpr::Tag(s[1..].to_string()));
        }
        
        // Treat as full-text search
        Ok(QueryExpr::FullText(s))
    }
}

/// Convenience function to parse a query string
pub fn parse(input: &str) -> Result<QueryExpr, QueryError> {
    if input.trim().is_empty() {
        return Err(QueryError::new("Query cannot be empty")
            .with_kind(QueryErrorKind::EmptyQuery));
    }
    
    let mut parser = Parser::new(input)?;
    parser.parse()
}

/// Validate a query string without returning the AST
pub fn validate(input: &str) -> Result<(), QueryError> {
    parse(input).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_simple_field_filter() {
        let expr = parse("tag:work").unwrap();
        assert!(matches!(expr, QueryExpr::Tag(ref s) if s == "work"));
    }
    
    #[test]
    fn test_and_expression() {
        let expr = parse("tag:work AND created:>2024-01-01").unwrap();
        assert!(matches!(expr, QueryExpr::And(_, _)));
    }
    
    #[test]
    fn test_or_expression() {
        let expr = parse("tag:work OR tag:personal").unwrap();
        assert!(matches!(expr, QueryExpr::Or(_, _)));
    }
    
    #[test]
    fn test_not_expression() {
        let expr = parse("NOT tag:archived").unwrap();
        assert!(matches!(expr, QueryExpr::Not(_)));
    }
    
    #[test]
    fn test_grouping() {
        let expr = parse("(tag:work OR tag:urgent) AND created:>2024-01-01").unwrap();
        assert!(matches!(expr, QueryExpr::And(_, _)));
    }
    
    #[test]
    fn test_full_text() {
        let expr = parse("machine learning").unwrap();
        assert!(matches!(expr, QueryExpr::FullText(ref s) if s == "machine learning"));
    }
    
    #[test]
    fn test_quoted_string() {
        let expr = parse(r#"title:"hello world""#).unwrap();
        match expr {
            QueryExpr::Field { field, op, value } => {
                assert_eq!(field, "title");
                assert_eq!(op, Op::Contains);
                assert_eq!(value, Value::String("hello world".to_string()));
            }
            _ => panic!("Expected Field expression"),
        }
    }
    
    #[test]
    fn test_tag_prefix() {
        let expr = parse("#work").unwrap();
        assert!(matches!(expr, QueryExpr::Tag(ref s) if s == "work"));
    }
    
    #[test]
    fn test_complex_nested() {
        let input = r#"(tag:work OR tag:urgent) AND NOT archived:true AND created:>=2024-01-01"#;
        let expr = parse(input).unwrap();
        // Should be AND(AND(OR(...), NOT(...)), DateFilter)
        assert!(matches!(expr, QueryExpr::And(_, _)));
    }
    
    #[test]
    fn test_empty_query_error() {
        let result = parse("");
        assert!(result.is_err());
    }
    
    #[test]
    fn test_implicit_and() {
        let expr = parse("hello world").unwrap();
        assert!(matches!(expr, QueryExpr::And(_, _)));
    }
}
