'use client';

import { useState } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PipelineControls } from '@/lib/engine/types';
import {
  RotateCcwIcon,
  TargetIcon,
  ThermometerIcon,
  BrainCircuitIcon,
  SwordsIcon,
  ScaleIcon,
  SparklesIcon,
  CrosshairIcon,
  FlaskConicalIcon,
  ZapIcon,
  ShieldIcon,
  type LucideIcon,
} from 'lucide-react';

/* ─── Steering Presets ─── */

interface SteeringPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  desc: string;
  controls: Partial<PipelineControls>;
}

const PRESETS: SteeringPreset[] = [
  {
    id: 'creative',
    label: 'Creative',
    icon: SparklesIcon,
    color: 'var(--color-pfc-ember)',
    desc: 'High exploration, lateral thinking, unconventional angles',
    controls: {
      temperatureOverride: 1.3,
      focusDepthOverride: 3,
      complexityBias: 0.15,
      adversarialIntensity: 0.6,
      bayesianPriorStrength: 0.6,
    },
  },
  {
    id: 'focused',
    label: 'Focused',
    icon: CrosshairIcon,
    color: 'var(--color-pfc-cyan)',
    desc: 'Deep single-topic analysis, maximum precision',
    controls: {
      temperatureOverride: 0.4,
      focusDepthOverride: 9,
      complexityBias: 0.1,
      adversarialIntensity: 1.0,
      bayesianPriorStrength: 1.2,
    },
  },
  {
    id: 'analytical',
    label: 'Analytical',
    icon: FlaskConicalIcon,
    color: 'var(--color-pfc-violet)',
    desc: 'Full statistical pipeline, maximum rigor',
    controls: {
      temperatureOverride: 0.5,
      focusDepthOverride: 8,
      complexityBias: 0.25,
      adversarialIntensity: 1.6,
      bayesianPriorStrength: 1.5,
    },
  },
  {
    id: 'challenge',
    label: 'Challenge',
    icon: SwordsIcon,
    color: 'var(--color-pfc-red)',
    desc: 'Maximum adversarial intensity, stress-test claims',
    controls: {
      temperatureOverride: 0.6,
      focusDepthOverride: 7,
      complexityBias: 0.2,
      adversarialIntensity: 2.0,
      bayesianPriorStrength: 1.8,
    },
  },
  {
    id: 'quick',
    label: 'Quick',
    icon: ZapIcon,
    color: 'var(--color-pfc-green)',
    desc: 'Fast broad response, minimal deep analysis',
    controls: {
      temperatureOverride: 0.7,
      focusDepthOverride: 2,
      complexityBias: -0.2,
      adversarialIntensity: 0.5,
      bayesianPriorStrength: 0.7,
    },
  },
  {
    id: 'cautious',
    label: 'Cautious',
    icon: ShieldIcon,
    color: 'var(--color-pfc-green)',
    desc: 'Conservative estimates, strong priors, flag risks',
    controls: {
      temperatureOverride: 0.35,
      focusDepthOverride: 6,
      complexityBias: 0.05,
      adversarialIntensity: 1.4,
      bayesianPriorStrength: 2.0,
    },
  },
];

/* ─── Control Row ─── */

interface ControlRowProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  autoEnabled: boolean;
  onAutoToggle: () => void;
  onChange: (v: number) => void;
  color?: string;
}

function ControlRow({
  label,
  icon,
  value,
  min,
  max,
  step,
  displayValue,
  autoEnabled,
  onAutoToggle,
  onChange,
  color = 'text-pfc-ember',
}: ControlRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-4 w-4', color)}>{icon}</span>
          <span className="text-[11px] font-medium text-foreground/80">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {autoEnabled ? 'Auto' : displayValue}
          </span>
          <Switch
            checked={!autoEnabled}
            onCheckedChange={onAutoToggle}
            size="sm"
            activeColor="var(--color-pfc-violet)"
          />
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v!)}
        disabled={autoEnabled}
        className={cn(
          'h-1.5',
          autoEnabled && 'opacity-30 pointer-events-none',
        )}
      />
    </div>
  );
}

/* ─── Preset Chip ─── */

function PresetChip({
  preset,
  active,
  onSelect,
}: {
  preset: SteeringPreset;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = preset.icon;
  return (
    <button
      onClick={onSelect}
      title={preset.desc}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.25rem 0.625rem',
        borderRadius: '9999px',
        fontSize: '0.625rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
        fontFamily: 'var(--font-heading)',
        border: active ? `1.5px solid ${preset.color}` : '1.5px solid transparent',
        background: active ? `color-mix(in srgb, ${preset.color} 12%, transparent)` : 'var(--glass-bg)',
        color: active ? preset.color : 'var(--muted-foreground)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon style={{ width: '0.75rem', height: '0.75rem', flexShrink: 0 }} />
      {preset.label}
    </button>
  );
}

/* ─── Main Component ─── */

export function LiveControls() {
  const open = usePFCStore((s) => s.liveControlsOpen);
  const controls = usePFCStore((s) => s.controls);
  const setControls = usePFCStore((s) => s.setControls);
  const resetControls = usePFCStore((s) => s.resetControls);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (preset: SteeringPreset) => {
    if (activePreset === preset.id) {
      // Toggle off — reset to defaults
      resetControls();
      setActivePreset(null);
    } else {
      setControls(preset.controls);
      setActivePreset(preset.id);
    }
  };

  // If user manually changes a slider, clear the active preset indicator
  const handleSliderChange = (partial: Partial<PipelineControls>) => {
    setControls(partial);
    setActivePreset(null);
  };

  const handleReset = () => {
    resetControls();
    setActivePreset(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="overflow-hidden"
          style={{ overflow: 'hidden', transform: 'translateZ(0)' }}
        >
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <div className="rounded-2xl p-4 space-y-4 border border-border/15" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuitIcon className="h-3.5 w-3.5 text-pfc-violet" />
                  <span className="text-xs font-semibold tracking-tight">Live Controls</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                  onClick={handleReset}
                >
                  <RotateCcwIcon className="h-3 w-3" />
                  Reset
                </Button>
              </div>

              {/* Steering Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {PRESETS.map((p) => (
                  <PresetChip
                    key={p.id}
                    preset={p}
                    active={activePreset === p.id}
                    onSelect={() => applyPreset(p)}
                  />
                ))}
              </div>

              {/* Slider grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <ControlRow
                  label="Focus Depth"
                  icon={<TargetIcon className="h-4 w-4" />}
                  value={controls.focusDepthOverride ?? 5}
                  min={2}
                  max={10}
                  step={1}
                  displayValue={String(controls.focusDepthOverride ?? 5)}
                  autoEnabled={controls.focusDepthOverride === null}
                  onAutoToggle={() =>
                    handleSliderChange({
                      focusDepthOverride: controls.focusDepthOverride === null ? 5 : null,
                    })
                  }
                  onChange={(v) => handleSliderChange({ focusDepthOverride: v })}
                  color="text-pfc-cyan"
                />

                <ControlRow
                  label="Temperature"
                  icon={<ThermometerIcon className="h-4 w-4" />}
                  value={controls.temperatureOverride ?? 1.0}
                  min={0.3}
                  max={1.5}
                  step={0.1}
                  displayValue={(controls.temperatureOverride ?? 1.0).toFixed(1)}
                  autoEnabled={controls.temperatureOverride === null}
                  onAutoToggle={() =>
                    handleSliderChange({
                      temperatureOverride: controls.temperatureOverride === null ? 1.0 : null,
                    })
                  }
                  onChange={(v) => handleSliderChange({ temperatureOverride: v })}
                  color="text-pfc-ember"
                />

                <ControlRow
                  label="Complexity Bias"
                  icon={<BrainCircuitIcon className="h-4 w-4" />}
                  value={controls.complexityBias}
                  min={-0.3}
                  max={0.3}
                  step={0.05}
                  displayValue={`${controls.complexityBias > 0 ? '+' : ''}${(controls.complexityBias * 100).toFixed(0)}%`}
                  autoEnabled={false}
                  onAutoToggle={() => handleSliderChange({ complexityBias: 0 })}
                  onChange={(v) => handleSliderChange({ complexityBias: v })}
                  color="text-pfc-violet"
                />

                <ControlRow
                  label="Adversarial Intensity"
                  icon={<SwordsIcon className="h-4 w-4" />}
                  value={controls.adversarialIntensity}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  displayValue={`${controls.adversarialIntensity.toFixed(1)}x`}
                  autoEnabled={false}
                  onAutoToggle={() => handleSliderChange({ adversarialIntensity: 1.0 })}
                  onChange={(v) => handleSliderChange({ adversarialIntensity: v })}
                  color="text-pfc-red"
                />

                <ControlRow
                  label="Bayesian Prior Strength"
                  icon={<ScaleIcon className="h-4 w-4" />}
                  value={controls.bayesianPriorStrength}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  displayValue={`${controls.bayesianPriorStrength.toFixed(1)}x`}
                  autoEnabled={false}
                  onAutoToggle={() => handleSliderChange({ bayesianPriorStrength: 1.0 })}
                  onChange={(v) => handleSliderChange({ bayesianPriorStrength: v })}
                  color="text-pfc-green"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
