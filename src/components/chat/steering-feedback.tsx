import { useState } from 'react';
import { ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';
import { useSteeringStore } from '@/lib/store/use-steering-store';
import { cn } from '@/lib/utils';

interface SteeringFeedbackProps {
  synthesisKeyId: string | null;
}

export function SteeringFeedback({ synthesisKeyId }: SteeringFeedbackProps) {
  const rateMessage = useSteeringStore((s) => s.rateMessage);
  const [rating, setRating] = useState<number | null>(null);

  if (!synthesisKeyId) return null;

  const handleRate = (value: number) => {
    const newRating = rating === value ? null : value;
    setRating(newRating);
    if (newRating !== null) {
      rateMessage(synthesisKeyId, newRating);
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1.5">
      <button
        onClick={() => handleRate(1)}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200',
          'hover:bg-pfc-green/15',
          rating === 1
            ? 'bg-pfc-green/15 text-pfc-green scale-110'
            : 'text-muted-foreground/40 hover:text-pfc-green/70',
        )}
        title="Good analysis — steer toward more like this"
        aria-label="Good analysis — steer toward more like this"
      >
        <ThumbsUpIcon className="h-3 w-3" />
      </button>
      <button
        onClick={() => handleRate(-1)}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200',
          'hover:bg-pfc-red/15',
          rating === -1
            ? 'bg-pfc-red/15 text-pfc-red scale-110'
            : 'text-muted-foreground/40 hover:text-pfc-red/70',
        )}
        title="Poor analysis — steer away from this"
        aria-label="Poor analysis — steer away from this"
      >
        <ThumbsDownIcon className="h-3 w-3" />
      </button>
      {rating !== null && (
        <span
          className="animate-fade-in text-[10px] text-muted-foreground/50 ml-0.5"
        >
          {rating === 1 ? 'Steering reinforced' : 'Steering adjusted'}
        </span>
      )}
    </div>
  );
}
