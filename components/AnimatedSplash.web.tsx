import { useEffect } from 'react';

/**
 * Web has no native launch screen to hand off from (index.html covers the
 * load), so there is nothing to animate. This stub, picked up by Metro in
 * place of AnimatedSplash.tsx, also keeps the splash art out of the web bundle.
 */
export default function AnimatedSplash({ onDone }: { ready: boolean; onDone: () => void }) {
  useEffect(() => {
    onDone();
  }, [onDone]);
  return null;
}
