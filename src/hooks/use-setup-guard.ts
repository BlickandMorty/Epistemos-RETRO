import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { readString } from '@/lib/storage-versioning';

/**
 * Checks if PFC setup has been completed (localStorage).
 * Returns `true` when the user is cleared to view the page.
 * Redirects to /onboarding if setup isn't done.
 */
export function useSetupGuard(): boolean {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const done = Boolean(readString('pfc-setup-done'));
    if (done) {
      setReady(true);
    } else {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

  return ready;
}
