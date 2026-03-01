'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readString } from '@/lib/storage-versioning';

/**
 * Checks if PFC setup has been completed (localStorage).
 * Returns `true` when the user is cleared to view the page.
 * Redirects to /onboarding if setup isn't done.
 */
export function useSetupGuard(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const done = Boolean(readString('pfc-setup-done'));
    if (done) {
      setReady(true);
    } else {
      router.replace('/onboarding');
    }
  }, [router]);

  return ready;
}
