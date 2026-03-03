//! Query Tokenizer (Lexer)
//!
//! Converts query strings into a stream of tokens for the parser.
//! Supports field filters, operators, quoted strings, and boolean keywords.

use super::ast::{Op, QueryError, QueryErrorKind};

/// Token types for the query language
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // Literals
    String(String),
    Number(f64),
    Boolean(bool),
    
    // Identifiers
    Identifier(String),
    Field(String), // field name followed by colon
    
    // Operators
    Operator(Op),
    
    // Boolean operators
    And,
    Or,
    Not,
    
    // Grouping
    LParen, // (
    RParen, // )
    
    // Special
    Colon,      // :
    Comma,      // ,
    EOF,
}

/// Tokenizer state
pub struct Tokenizer<'a> {
    input: &'a str,
    position: usize,
    current_char: Option<char>,
}

impl<'a> Tokenizer<'a> {
    /// Create a new tokenizer for the input string
    pub fn new(input: &'a str) -> Self {
        let mut t = Self {
            input,
            position: 0,
            current_char: None,
        };
        t.advance();
        t
    }
    
    /// Advance to the next character
    fn advance(&mut self) {
        self.current_char = self.input.chars().nth(self.position);
        if self.current_char.is_some() {
            self.position += 1;
        }
    }
    
    /// Peek at the next character without consuming it
    fn peek(&self) -> Option<char> {
        self.input.chars().nth(self.position)
    }
    
    /// Skip whitespace characters
    fn skip_whitespace(&mut self) {
        while let Some(c) = self.current_char {
            if c.is_whitespace() {
                self.advance();
            } else {
                break;
            }
        }
    }
    
    /// Read a quoted string (single or double quotes)
    fn read_quoted_string(&mut self, quote: char) -> Result<String, QueryError> {
        let mut result = String::new();
        self.advance(); // consume opening quote
        
        while let Some(c) = self.current_char {
            if c == quote {
                self.advance(); // consume closing quote
                return Ok(result);
            } else if c == '\\' {
                self.advance();
                if let Some(escaped) = self.current_char {
                    result.push(match escaped {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '\\' => '\\',
                        '"' => '"',
                        '\'' => '\'',
                        _ => escaped,
                    });
                    self.advance();
                }
            } else {
                result.push(c);
                self.advance();
            }
        }
        
        Err(QueryError::new("Unclosed string literal")
            .with_position(self.position)
            .with_kind(QueryErrorKind::UnclosedQuote))
    }
    
    /// Read a number (integer or float)
    fn read_number(&mut self) -> f64 {
        let start = self.position - 1;
        let mut has_dot = false;
        
        while let Some(c) = self.current_char {
            if c.is_ascii_digit() {
                self.advance();
            } else if c == '.' && !has_dot {
                has_dot = true;
                self.advance();
            } else if c == '_' {
                // Allow underscores in numbers for readability (e.g., 1_000_000)
                self.advance();
            } else {
                break;
            }
        }
        
        let num_str: String = self.input[start..self.position - 1]
            .chars()
            .filter(|&c| c != '_')
            .collect();
        
        num_str.parse().unwrap_or(0.0)
    }
    
    /// Read an identifier or keyword
    fn read_identifier(&mut self) -> String {
        let start = self.position - 1;
        
        while let Some(c) = self.current_char {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                self.advance();
            } else {
                break;
            }
        }
        
        self.input[start..self.position - 1].to_string()
    }
    
    /// Read an operator
    fn read_operator(&mut self) -> Op {
        let start = self.position - 1;
        
        // Check for multi-character operators first
        if let Some(_c) = self.current_char {
            let two_char = &self.input[start - 1..=start];
            match two_char {
                "<=" | ">=" | "!=" | "==" => {
                    self.advance();
                    return Op::from_str(two_char).unwrap_or(Op::Eq);
                }
                _ => {}
            }
        }
        
        // Single character operators
        Op::from_str(&self.input[start - 1..start])
            .unwrap_or(Op::Eq)
    }
    
    /// Get the next token
    pub fn next_token(&mut self) -> Result<Token, QueryError> {
        self.skip_whitespace();
        
        let Some(c) = self.current_char else {
            return Ok(Token::EOF);
        };
        
        match c {
            // Quoted strings
            '"' | '\'' => {
                let s = self.read_quoted_string(c)?;
                Ok(Token::String(s))
            }
            
            // Parentheses
            '(' => {
                self.advance();
                Ok(Token::LParen)
            }
            ')' => {
                self.advance();
                Ok(Token::RParen)
            }
            
            // Colon (field separator)
            ':' => {
                self.advance();
                Ok(Token::Colon)
            }
            
            // Comma
            ',' => {
                self.advance();
                Ok(Token::Comma)
            }
            
            // Operators
            '=' | '!' | '<' | '>' | '~' => {
                let op = self.read_operator();
                Ok(Token::Operator(op))
            }
            
            // Numbers
            _ if c.is_ascii_digit() => {
                let num = self.read_number();
                Ok(Token::Number(num))
            }
            
            // Negative numbers
            '-' if self.peek().map(|c| c.is_ascii_digit()).unwrap_or(false) => {
                self.advance();
                let num = -self.read_number();
                Ok(Token::Number(num))
            }
            
            // Identifiers and keywords
            _ if c.is_alphabetic() || c == '_' => {
                let ident = self.read_identifier();
                
                // Check for keywords (case-insensitive)
                let lower = ident.to_lowercase();
                match lower.as_str() {
                    "and" | "&&" => Ok(Token::And),
                    "or" | "||" => Ok(Token::Or),
                    "not" | "!" => Ok(Token::Not),
                    "true" => Ok(Token::Boolean(true)),
                    "false" => Ok(Token::Boolean(false)),
                    _ => {
                        // Check if next non-whitespace char is colon (field)
                        self.skip_whitespace();
                        if self.current_char == Some(':') {
                            self.advance();
                            Ok(Token::Field(ident))
                        } else {
                            Ok(Token::Identifier(ident))
                        }
                    }
                }
            }
            
            // Unexpected character
            _ => {
                let pos = self.position;
                self.advance();
                Err(QueryError::new(format!("Unexpected character: {}", c))
                    .with_position(pos)
                    .with_kind(QueryErrorKind::UnexpectedToken))
            }
        }
    }
    
    /// Tokenize the entire input into a vector of tokens
    pub fn tokenize(&mut self) -> Result<Vec<Token>, QueryError> {
        let mut tokens = Vec::new();
        
        loop {
            match self.next_token()? {
                Token::EOF => {
                    tokens.push(Token::EOF);
                    break;
                }
                token => tokens.push(token),
            }
        }
        
        Ok(tokens)
    }
    
    /// Get current position
    pub fn position(&self) -> usize {
        self.position
    }
}

/// Convenience function to tokenize a query string
pub fn tokenize(input: &str) -> Result<Vec<Token>, QueryError> {
    Tokenizer::new(input).tokenize()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_simple_tokens() {
        let input = "tag:work AND created:>2024-01-01";
        let tokens = tokenize(input).unwrap();
        
        assert!(matches!(tokens[0], Token::Field(ref s) if s == "tag"));
        assert!(matches!(tokens[1], Token::String(ref s) if s == "work"));
        assert!(matches!(tokens[2], Token::And));
        assert!(matches!(tokens[3], Token::Field(ref s) if s == "created"));
        assert!(matches!(tokens[4], Token::Operator(Op::Gt)));
    }
    
    #[test]
    fn test_quoted_strings() {
        let input = r#"title:"hello world""#;
        let tokens = tokenize(input).unwrap();
        
        assert!(matches!(tokens[0], Token::Field(ref s) if s == "title"));
        assert!(matches!(tokens[1], Token::String(ref s) if s == "hello world"));
    }
    
    #[test]
    fn test_numbers() {
        let input = "word_count:>100";
        let tokens = tokenize(input).unwrap();
        
        assert!(matches!(tokens[0], Token::Field(ref s) if s == "word_count"));
        assert!(matches!(tokens[1], Token::Operator(Op::Gt)));
        assert!(matches!(tokens[2], Token::Number(100.0)));
    }
    
    #[test]
    fn test_boolean_operators() {
        let input = "a AND b OR NOT c";
        let tokens = tokenize(input).unwrap();
        
        assert!(matches!(tokens[1], Token::And));
        assert!(matches!(tokens[3], Token::Or));
        assert!(matches!(tokens[4], Token::Not));
    }
    
    #[test]
    fn test_parens() {
        let input = "(a AND b) OR c";
        let tokens = tokenize(input).unwrap();
        
        assert!(matches!(tokens[0], Token::LParen));
        assert!(matches!(tokens[4], Token::RParen));
    }
    
    #[test]
    fn test_empty_input() {
        let tokens = tokenize("").unwrap();
        assert!(matches!(tokens[0], Token::EOF));
    }
}
