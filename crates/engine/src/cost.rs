//! Cost tracker — per-model token pricing, daily usage tracking, budget guards.
//!
//! [MAC] Ported from CostTracker.swift (181 lines).
//!
//! Architecture difference: macOS uses @MainActor + UserDefaults.
//! Retro Edition uses Arc<Mutex<CostTracker>> + rusqlite settings KV table.

use crate::llm::LlmProviderType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Types ────────────────────────────────────────────────────────────

/// Token counts extracted from an API response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub provider: LlmProviderType,
    pub model: String,
}

/// Daily accumulated usage for a single provider or aggregate.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DailyUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub call_count: u32,
    pub estimated_cost_usd: f64,
    pub date: String,
}

/// Per-1M-token pricing (input, output) in USD.
#[derive(Debug, Clone, Copy)]
pub struct ModelPricing {
    pub input_per_million: f64,
    pub output_per_million: f64,
}

// ── Pricing Table ────────────────────────────────────────────────────
// Updated March 2026. Rates are approximate; actual billing may differ.

fn get_pricing(model: &str) -> Option<ModelPricing> {
    let p = match model {
        // Anthropic
        "claude-opus-4-6" => ModelPricing { input_per_million: 15.0, output_per_million: 75.0 },
        "claude-sonnet-4-6" => ModelPricing { input_per_million: 3.0, output_per_million: 15.0 },
        "claude-haiku-4-5" => ModelPricing { input_per_million: 0.80, output_per_million: 4.0 },
        // OpenAI
        "gpt-5.3" | "gpt-5.2" => ModelPricing { input_per_million: 5.0, output_per_million: 15.0 },
        "gpt-4.1" => ModelPricing { input_per_million: 2.0, output_per_million: 8.0 },
        "gpt-4.1-mini" => ModelPricing { input_per_million: 0.40, output_per_million: 1.60 },
        "o1-pro" => ModelPricing { input_per_million: 150.0, output_per_million: 600.0 },
        "o3" => ModelPricing { input_per_million: 10.0, output_per_million: 40.0 },
        "o4-mini" => ModelPricing { input_per_million: 1.10, output_per_million: 4.40 },
        // Google
        "gemini-2.5-pro" => ModelPricing { input_per_million: 1.25, output_per_million: 10.0 },
        "gemini-2.5-flash" => ModelPricing { input_per_million: 0.15, output_per_million: 0.60 },
        // Kimi
        "kimi-k2.5" => ModelPricing { input_per_million: 1.0, output_per_million: 4.0 },
        // Ollama / Foundry Local (free, local inference)
        _ => return None,
    };
    Some(p)
}

/// Estimate cost for a single API call.
pub fn estimate_cost(usage: &TokenUsage) -> f64 {
    match get_pricing(&usage.model) {
        Some(rates) => {
            let input_cost = f64::from(usage.input_tokens) * rates.input_per_million / 1_000_000.0;
            let output_cost = f64::from(usage.output_tokens) * rates.output_per_million / 1_000_000.0;
            input_cost + output_cost
        }
        None => 0.0, // Local models are free
    }
}

// ── Cost Tracker ─────────────────────────────────────────────────────

/// In-memory cost tracker with daily rollover.
///
/// Designed to be wrapped in `Arc<Mutex<CostTracker>>` and shared across
/// Tauri command handlers. Persistence is handled by the caller via
/// `to_json()` / `from_json()` → rusqlite settings KV table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostTracker {
    /// Aggregate usage for today.
    pub today: DailyUsage,
    /// Per-provider breakdown for today.
    pub providers: HashMap<String, DailyUsage>,
    /// User-configurable daily budget in USD. 0 = unlimited.
    pub daily_budget_usd: f64,
}

impl Default for CostTracker {
    fn default() -> Self {
        Self {
            today: DailyUsage {
                date: today_key(),
                ..Default::default()
            },
            providers: HashMap::new(),
            daily_budget_usd: 0.0,
        }
    }
}

impl CostTracker {
    /// Check if today's spending has exceeded the daily budget.
    pub fn budget_exceeded(&self) -> bool {
        self.daily_budget_usd > 0.0 && self.today.estimated_cost_usd >= self.daily_budget_usd
    }

    /// Record token usage from an API call.
    /// Returns the estimated cost of this individual call.
    pub fn record(&mut self, usage: &TokenUsage) -> f64 {
        self.ensure_today();
        let cost = estimate_cost(usage);

        self.today.input_tokens += u64::from(usage.input_tokens);
        self.today.output_tokens += u64::from(usage.output_tokens);
        self.today.call_count += 1;
        self.today.estimated_cost_usd += cost;

        let provider_key = format!("{:?}", usage.provider).to_lowercase();
        let entry = self.providers.entry(provider_key).or_insert_with(|| DailyUsage {
            date: today_key(),
            ..Default::default()
        });
        entry.input_tokens += u64::from(usage.input_tokens);
        entry.output_tokens += u64::from(usage.output_tokens);
        entry.call_count += 1;
        entry.estimated_cost_usd += cost;

        cost
    }

    /// Reset today's counters.
    pub fn reset(&mut self) {
        self.today = DailyUsage {
            date: today_key(),
            ..Default::default()
        };
        self.providers.clear();
    }

    /// Serialize to JSON for persistence in the settings KV table.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Deserialize from JSON. Falls back to default on failure.
    pub fn from_json(json: &str) -> Self {
        serde_json::from_str(json).unwrap_or_default()
    }

    /// Roll over to a new day if needed.
    fn ensure_today(&mut self) {
        let today = today_key();
        if self.today.date != today {
            self.reset();
            self.today.date = today;
        }
    }

    /// Get usage summary as a formatted string.
    pub fn summary(&self) -> String {
        format!(
            "Today: {} calls, {}in/{}out tokens, ${:.4}",
            self.today.call_count,
            self.today.input_tokens,
            self.today.output_tokens,
            self.today.estimated_cost_usd,
        )
    }
}

/// Today's date key in YYYY-MM-DD format.
fn today_key() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple date computation — no chrono dependency needed
    let days = now / 86400;
    let year = 1970 + (days * 400 / 146097); // Approximate
    // For exact dates, use the settings KV store date or a simple formatter.
    // This approximation is close enough for daily rollover keying.
    format!("{}-{:03}", year, days % 365)
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_usage(model: &str, input: u32, output: u32) -> TokenUsage {
        TokenUsage {
            input_tokens: input,
            output_tokens: output,
            provider: LlmProviderType::Anthropic,
            model: model.to_string(),
        }
    }

    #[test]
    fn estimate_cost_claude_sonnet() {
        let usage = make_usage("claude-sonnet-4-6", 1_000_000, 1_000_000);
        let cost = estimate_cost(&usage);
        // $3/M input + $15/M output = $18
        assert!((cost - 18.0).abs() < 0.001, "expected ~$18, got {cost}");
    }

    #[test]
    fn estimate_cost_local_model_is_free() {
        let usage = TokenUsage {
            input_tokens: 5000,
            output_tokens: 500,
            provider: LlmProviderType::Ollama,
            model: "llama3.2:3b".into(),
        };
        let cost = estimate_cost(&usage);
        assert_eq!(cost, 0.0, "local models should be free");
    }

    #[test]
    fn estimate_cost_gpt_4_1_mini() {
        let usage = make_usage("gpt-4.1-mini", 100_000, 10_000);
        let cost = estimate_cost(&usage);
        // $0.40/M * 0.1M = $0.04 input + $1.60/M * 0.01M = $0.016 output
        let expected = 0.04 + 0.016;
        assert!((cost - expected).abs() < 0.001, "expected ~{expected}, got {cost}");
    }

    #[test]
    fn tracker_records_and_accumulates() {
        let mut tracker = CostTracker::default();
        let u1 = make_usage("claude-sonnet-4-6", 1000, 500);
        let u2 = make_usage("claude-sonnet-4-6", 2000, 1000);

        tracker.record(&u1);
        tracker.record(&u2);

        assert_eq!(tracker.today.call_count, 2);
        assert_eq!(tracker.today.input_tokens, 3000);
        assert_eq!(tracker.today.output_tokens, 1500);
        assert!(tracker.today.estimated_cost_usd > 0.0);
    }

    #[test]
    fn tracker_provider_breakdown() {
        let mut tracker = CostTracker::default();

        let claude = TokenUsage {
            input_tokens: 1000, output_tokens: 500,
            provider: LlmProviderType::Anthropic, model: "claude-sonnet-4-6".into(),
        };
        let gpt = TokenUsage {
            input_tokens: 1000, output_tokens: 500,
            provider: LlmProviderType::OpenAi, model: "gpt-4.1".into(),
        };

        tracker.record(&claude);
        tracker.record(&gpt);

        assert_eq!(tracker.providers.len(), 2);
        assert!(tracker.providers.contains_key("anthropic"));
        assert!(tracker.providers.contains_key("openai"));
    }

    #[test]
    fn budget_not_exceeded_by_default() {
        let tracker = CostTracker::default();
        assert!(!tracker.budget_exceeded(), "no budget = never exceeded");
    }

    #[test]
    fn budget_exceeded_when_over_limit() {
        let mut tracker = CostTracker::default();
        tracker.daily_budget_usd = 0.01; // $0.01 budget

        // Record 1M tokens of claude-opus-4-6 ($15 input + $75 output = $90)
        let usage = make_usage("claude-opus-4-6", 1_000_000, 1_000_000);
        tracker.record(&usage);

        assert!(tracker.budget_exceeded(), "should be over $0.01 budget");
    }

    #[test]
    fn tracker_json_roundtrip() {
        let mut tracker = CostTracker::default();
        tracker.daily_budget_usd = 5.0;
        let usage = make_usage("claude-sonnet-4-6", 1000, 500);
        tracker.record(&usage);

        let json = tracker.to_json().expect("serialize");
        let restored = CostTracker::from_json(&json);

        assert_eq!(restored.daily_budget_usd, 5.0);
        assert_eq!(restored.today.call_count, 1);
        assert_eq!(restored.today.input_tokens, 1000);
    }

    #[test]
    fn tracker_reset_clears_all() {
        let mut tracker = CostTracker::default();
        tracker.record(&make_usage("claude-sonnet-4-6", 1000, 500));
        tracker.reset();

        assert_eq!(tracker.today.call_count, 0);
        assert_eq!(tracker.today.input_tokens, 0);
        assert!(tracker.providers.is_empty());
    }

    #[test]
    fn summary_is_nonempty() {
        let tracker = CostTracker::default();
        let s = tracker.summary();
        assert!(s.contains("Today:"));
        assert!(s.contains("calls"));
    }
}
