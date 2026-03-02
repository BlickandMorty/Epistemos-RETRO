import { memo, useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, AtomIcon } from 'lucide-react';
import { PixelBook } from '../decorative/pixel-mascots';

interface ThinkingAccordionProps {
  content: string;
  duration?: number | null;
  isThinking: boolean;
  className?: string;
}



export const ThinkingAccordion = memo<ThinkingAccordionProps>(function ThinkingAccordion({
  content,
  duration,
  isThinking,
  className,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const effectiveExpanded = isThinking || isExpanded;

  // Auto-scroll during active thinking
  useEffect(() => {
    if (isThinking && effectiveExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isThinking, effectiveExpanded]);

  if (!content && !isThinking) return null;

  const durationText = duration
    ? `Thought for ${(duration / 1000).toFixed(1)}s`
    : isThinking
      ? 'Thinking'
      : 'Thought';

  return (
    <div className={`rounded-xl overflow-hidden ${className ?? ''}`}>
      {/* Header */}
      <button
        onClick={() => {
          if (!isThinking) setIsExpanded((prev) => !prev);
        }}
        aria-expanded={effectiveExpanded}
        aria-label={`${durationText} — ${effectiveExpanded ? 'collapse' : 'expand'} reasoning`}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs
                   bg-white/[0.04] dark:bg-white/[0.02] hover:bg-white/[0.06]
                   transition-colors duration-200"
      >
        {/* Status icon */}
        <span className="flex items-center justify-center w-5 h-5 rounded-md
                        bg-white/[0.06] dark:bg-white/[0.04]">
          {isThinking ? (
            <PixelBook size={16} />
          ) : (
            <AtomIcon className={`w-3 h-3 ${effectiveExpanded ? 'text-pfc-violet' : 'text-muted-foreground/50'}`} />
          )}
        </span>

        {/* Label */}
        <span className={`flex-1 text-left ${isThinking ? 'text-pfc-violet font-medium thinking-shimmer' : 'text-muted-foreground/60'}`}>
          {durationText}
        </span>

        {/* Chevron */}
        <span
          style={{
            transform: `rotate(${effectiveExpanded ? 180 : 0}deg)`,
            transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground/40" />
        </span>
      </button>

      {/* Content */}
      <div
        className="overflow-hidden"
        style={{
          height: effectiveExpanded ? 'auto' : 0,
          opacity: effectiveExpanded ? 1 : 0,
          transition: 'height 0.25s cubic-bezier(0.2, 0, 0, 1), opacity 0.25s cubic-bezier(0.2, 0, 0, 1)',
          transform: 'translateZ(0)',
          pointerEvents: effectiveExpanded ? 'auto' : 'none',
        }}
      >
        <div
          ref={scrollRef}
          className="max-h-[200px] overflow-y-auto px-3 py-2
                     text-xs leading-relaxed text-muted-foreground/70
                     scrollbar-thin scrollbar-thumb-white/10"
          style={{ willChange: 'scroll-position', overscrollBehavior: 'contain', transform: 'translateZ(0)' }}
        >
          <div className="whitespace-pre-wrap break-words">
            {content}
            {isThinking && (
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-pfc-violet animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
