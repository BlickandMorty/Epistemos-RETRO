'use client';

import { useState } from 'react';
import type { DualMessage } from '@/lib/engine/types';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageResearchProps {
  dualMessage: DualMessage;
}

export function MessageResearch({ dualMessage }: MessageResearchProps) {
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [arbitrationOpen, setArbitrationOpen] = useState(false);

  const { rawAnalysis, uncertaintyTags, reflection, arbitration } = dualMessage;

  return (
    <div className="space-y-3">
      {/* Raw Analysis — sans-serif for readability, tags inline */}
      <div
        style={{ fontSize: 'var(--type-meta)', lineHeight: 1.7 }}
        className="text-foreground/85 break-words"
      >
        {rawAnalysis.split(/(\[(?:DATA|MODEL|UNCERTAIN|CONFLICT)\])/).map((part, i) => {
          if (/^\[(?:DATA|MODEL|UNCERTAIN|CONFLICT)\]$/.test(part)) {
            const tag = part.replace(/[[\]]/g, '');
            return (
              <Badge
                key={i}
                variant="outline"
                style={{ fontSize: 'var(--type-tag-inline)' }}
                className={cn(
                  'mx-0.5 py-0 align-middle',
                  tag === 'DATA' ? 'border-pfc-green/50 text-pfc-green' :
                  tag === 'MODEL' ? 'border-pfc-violet/50 text-pfc-violet' :
                  tag === 'UNCERTAIN' ? 'border-pfc-yellow/50 text-pfc-yellow' :
                  'border-pfc-red/50 text-pfc-red'
                )}
              >
                {tag}
              </Badge>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>

      {/* Tag summary */}
      <div className="flex flex-wrap gap-1.5">
        {['DATA', 'MODEL', 'UNCERTAIN', 'CONFLICT'].map((tag) => {
          const count = uncertaintyTags.filter((t) => t.tag === tag).length;
          if (count === 0) return null;
          return (
            <Badge
              key={tag}
              variant="secondary"
              style={{ fontSize: 'var(--type-tag)' }}
              className={cn(
                tag === 'DATA' ? 'bg-pfc-green/10 text-pfc-green' :
                tag === 'MODEL' ? 'bg-pfc-violet/10 text-pfc-violet' :
                tag === 'UNCERTAIN' ? 'bg-pfc-yellow/10 text-pfc-yellow' :
                'bg-pfc-red/10 text-pfc-red'
              )}
            >
              {tag} x{count}
            </Badge>
          );
        })}
      </div>

      {/* Reflection collapsible */}
      <Collapsible open={reflectionOpen} onOpenChange={setReflectionOpen}>
        <CollapsibleTrigger
          style={{ fontSize: 'var(--type-body-sm)' }}
          className="flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <ChevronDownIcon className={cn('h-3 w-3 transition-transform', reflectionOpen && 'rotate-180')} />
          Reflection ({reflection.selfCriticalQuestions.length} questions, {reflection.adjustments.length} adjustments)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2 pl-5">
          {reflection.selfCriticalQuestions.map((q, i) => (
            <p key={i} style={{ fontSize: 'var(--type-body-sm)' }} className="text-muted-foreground italic leading-relaxed">{q}</p>
          ))}
          {reflection.adjustments.length > 0 && (
            <div className="mt-1">
              <p style={{ fontSize: 'var(--type-tag)' }} className="font-medium uppercase tracking-wider text-pfc-yellow mb-1">Adjustments</p>
              {reflection.adjustments.map((a, i) => (
                <p key={i} style={{ fontSize: 'var(--type-body-sm)' }} className="text-pfc-yellow/80 leading-relaxed">{a}</p>
              ))}
            </div>
          )}
          <p style={{ fontSize: 'var(--type-body-sm)' }} className="text-muted-foreground leading-relaxed">
            <span className="font-medium">Least defensible:</span> {reflection.leastDefensibleClaim}
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Arbitration collapsible */}
      <Collapsible open={arbitrationOpen} onOpenChange={setArbitrationOpen}>
        <CollapsibleTrigger
          style={{ fontSize: 'var(--type-body-sm)' }}
          className="flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <ChevronDownIcon className={cn('h-3 w-3 transition-transform', arbitrationOpen && 'rotate-180')} />
          Arbitration ({arbitration.consensus ? 'Consensus' : 'Split'} — {arbitration.votes.length} engines)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1.5 pl-5">
          {arbitration.votes.map((vote, i) => (
            <div key={i} style={{ fontSize: 'var(--type-body-sm)' }} className="flex items-center gap-2">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                vote.position === 'supports' ? 'bg-pfc-green' :
                vote.position === 'opposes' ? 'bg-pfc-red' : 'bg-muted-foreground'
              )} />
              <span style={{ fontSize: 'var(--type-label-sm)' }} className="font-mono text-muted-foreground">{vote.engine}</span>
              <span
                style={{ fontSize: 'var(--type-label-sm)' }}
                className={cn(
                  vote.position === 'supports' ? 'text-pfc-green' :
                  vote.position === 'opposes' ? 'text-pfc-red' : 'text-muted-foreground'
                )}
              >
                {vote.position}
              </span>
              <span style={{ fontSize: 'var(--type-label-sm)' }} className="text-muted-foreground/50">({(vote.confidence * 100).toFixed(0)}%)</span>
            </div>
          ))}
          <p style={{ fontSize: 'var(--type-body-sm)' }} className="text-muted-foreground mt-1 leading-relaxed">{arbitration.resolution}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
