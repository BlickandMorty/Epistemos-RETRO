'use client';

import { useSteeringStore } from '@/lib/store/use-steering-store';
import { cn } from '@/lib/utils';
import { CompassIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function SteeringIndicator() {
  const config = useSteeringStore((s) => s.config);
  const stats = useSteeringStore((s) => s.stats);
  const currentBias = useSteeringStore((s) => s.currentBias);

  if (!config.enabled || stats.totalExemplars === 0) return null;

  const strength = currentBias.steeringStrength;
  const strengthPct = Math.round(strength * 100);

  // Color based on strength
  const color =
    strength > 0.5
      ? 'text-pfc-green'
      : strength > 0.1
      ? 'text-pfc-yellow'
      : 'text-muted-foreground/50';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
              'bg-card/50 border border-border/30',
              color,
            )}
            style={{ backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }}
          >
            <CompassIcon className="h-3 w-3" />
            <span>{strengthPct}%</span>
            {/* Mini strength bar */}
            <div className="h-1 w-8 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  strength > 0.5
                    ? 'bg-pfc-green'
                    : strength > 0.1
                    ? 'bg-pfc-yellow'
                    : 'bg-muted-foreground/30',
                )}
                style={{ width: `${strengthPct}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[200px]">
          <p className="font-semibold mb-1">Adaptive Steering</p>
          <p className="text-muted-foreground">
            {stats.totalExemplars} exemplar{stats.totalExemplars !== 1 ? 's' : ''} learned
            ({stats.positiveCount}↑ {stats.negativeCount}↓)
          </p>
          {currentBias.steeringSource !== 'none' && (
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              {currentBias.steeringSource}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
