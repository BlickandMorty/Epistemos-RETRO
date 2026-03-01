'use client';

import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════
   PageTransition — smooth route-change wrapper

   Wraps the App Router's {children} slot in AnimatePresence
   keyed by pathname. Uses ultra-fast exit (80ms) and snappy
   enter (150ms) for responsive page cycling.

   Refinement: `mode="wait"` ensures clean handoff between
   pages. Durations are short enough that rapid cycling
   still feels instant without overlapping DOM nodes.
   ═══════════════════════════════════════════════════════════ */

import { M3_EASE, M3_ACCEL } from '@/lib/motion/motion-config';

const pageVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.15, ease: M3_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.08, ease: M3_ACCEL },
  },
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Generation counter: on rapid route changes, only the latest
  // pathname's enter animation runs to completion. Prevents stale
  // intermediate pages from flashing.
  const genRef = useRef(0);
  const currentGen = ++genRef.current;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          position: 'absolute',
          inset: 0,
          willChange: 'opacity',
        }}
        onAnimationStart={() => {
          // If a newer route has arrived, skip this animation
          if (currentGen !== genRef.current) return;
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
