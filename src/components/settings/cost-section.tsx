import { useState, useEffect, useCallback } from 'react';
import { Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';
import type { CostSummary } from '@/lib/bindings';
import {
  DollarSignIcon,
  RotateCcwIcon,
  LoaderIcon,
  AlertTriangleIcon,
} from 'lucide-react';

export function CostSection() {
  const { isDark, isOled } = useIsDark();
  const addToast = usePFCStore((s) => s.addToast);

  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);

  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const subBorder = `1px solid ${isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await commands.getCostSummary();
    if (res.status === 'ok') {
      setSummary(res.data);
      setBudgetInput(res.data.daily_budget_usd > 0 ? res.data.daily_budget_usd.toFixed(2) : '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    const res = await commands.resetCostTracker();
    setResetting(false);
    if (res.status === 'ok') {
      addToast({ type: 'success', message: 'Cost tracker reset' });
      refresh();
    } else {
      addToast({ type: 'error', message: 'Failed to reset cost tracker' });
    }
  }, [addToast, refresh]);

  const handleBudgetSave = useCallback(async () => {
    const val = parseFloat(budgetInput) || 0;
    const res = await commands.setDailyBudget(val);
    if (res.status === 'ok') {
      addToast({ type: 'success', message: val > 0 ? `Budget set to $${val.toFixed(2)}/day` : 'Budget limit removed' });
      setEditingBudget(false);
      refresh();
    } else {
      addToast({ type: 'error', message: 'Failed to set budget' });
    }
  }, [budgetInput, addToast, refresh]);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.375rem 0',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    color: mutedColor,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  };

  if (loading) {
    return (
      <Section title="Cost Tracking">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
          <LoaderIcon style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '0.8125rem', color: mutedColor }}>Loading cost data...</span>
        </div>
      </Section>
    );
  }

  if (!summary) return null;

  const budgetPct = summary.daily_budget_usd > 0
    ? Math.min((summary.daily_cost_usd / summary.daily_budget_usd) * 100, 100)
    : 0;

  return (
    <Section title="Cost Tracking">
      {/* Today's usage */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Today's Usage</p>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <GlassBubbleButton onClick={handleReset} disabled={resetting} size="sm">
              {resetting
                ? <LoaderIcon style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                : <RotateCcwIcon style={{ width: 12, height: 12 }} />}
              Reset
            </GlassBubbleButton>
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>API Calls</span>
          <span style={valueStyle}>{summary.daily_call_count}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Input Tokens</span>
          <span style={valueStyle}>{summary.daily_input_tokens.toLocaleString()}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Output Tokens</span>
          <span style={valueStyle}>{summary.daily_output_tokens.toLocaleString()}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Estimated Cost</span>
          <span style={{ ...valueStyle, color: summary.budget_exceeded ? '#FF453A' : undefined }}>
            ${summary.daily_cost_usd.toFixed(4)}
          </span>
        </div>

        {summary.budget_exceeded && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            marginTop: '0.5rem',
            borderRadius: '0.5rem',
            background: 'rgba(255,69,58,0.1)',
            border: '1px solid rgba(255,69,58,0.2)',
          }}>
            <AlertTriangleIcon style={{ width: 14, height: 14, color: '#FF453A', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: '#FF453A' }}>Daily budget exceeded</span>
          </div>
        )}
      </div>

      {/* Budget */}
      <div style={{ borderTop: subBorder, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Daily Budget
        </p>

        {summary.daily_budget_usd > 0 && (
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              height: 6,
              borderRadius: 3,
              background: isOled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${budgetPct}%`,
                borderRadius: 3,
                background: budgetPct > 90 ? '#FF453A' : budgetPct > 70 ? '#FF9F0A' : '#30D158',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ ...rowStyle, padding: '0.25rem 0 0' }}>
              <span style={{ fontSize: '0.6875rem', color: mutedColor }}>
                ${summary.daily_cost_usd.toFixed(4)} / ${summary.daily_budget_usd.toFixed(2)}
              </span>
              <span style={{ fontSize: '0.6875rem', color: mutedColor }}>
                {budgetPct.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <DollarSignIcon style={{ width: 14, height: 14, color: mutedColor, flexShrink: 0 }} />
          <input
            type="number"
            step="0.50"
            min="0"
            value={editingBudget ? budgetInput : (summary.daily_budget_usd > 0 ? summary.daily_budget_usd.toFixed(2) : '')}
            placeholder="No limit"
            onChange={(e) => { setBudgetInput(e.target.value); setEditingBudget(true); }}
            onFocus={() => setEditingBudget(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBudgetSave(); if (e.key === 'Escape') { setEditingBudget(false); setBudgetInput(summary.daily_budget_usd > 0 ? summary.daily_budget_usd.toFixed(2) : ''); } }}
            style={{
              flex: 1,
              padding: '0.375rem 0.5rem',
              fontSize: '0.8125rem',
              fontVariantNumeric: 'tabular-nums',
              borderRadius: '0.375rem',
              border: subBorder,
              background: 'transparent',
              color: 'inherit',
              outline: 'none',
            }}
          />
          {editingBudget && (
            <GlassBubbleButton onClick={handleBudgetSave} size="sm">
              Save
            </GlassBubbleButton>
          )}
        </div>
        <p style={{ fontSize: '0.6875rem', color: mutedColor, marginTop: '0.25rem' }}>
          USD/day. Set to 0 or leave empty for unlimited.
        </p>
      </div>

      {/* Provider breakdown */}
      {summary.provider_breakdown.length > 0 && (
        <div style={{ borderTop: subBorder, paddingTop: '0.75rem', marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            By Provider
          </p>
          {summary.provider_breakdown.map((p) => (
            <div key={p.provider} style={rowStyle}>
              <span style={{ fontSize: '0.8125rem' }}>{p.provider}</span>
              <span style={{ fontSize: '0.75rem', color: mutedColor }}>
                {p.call_count} calls · ${p.cost_usd.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
