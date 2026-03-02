import { useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';

/**
 * PageTransition — smooth route-change wrapper.
 * Uses CSS fade-in keyed by pathname for snappy page cycling.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div
      key={pathname}
      className="animate-fade-in"
      style={{
        position: 'absolute',
        inset: 0,
      }}
    >
      {children}
    </div>
  );
}
