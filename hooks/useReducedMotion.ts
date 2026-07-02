import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the user has requested reduced motion (OS setting / media query).
 * Per design/DESIGN.md §2.4: when true, disable stagger and springs; replace
 * with <=150ms fades or no animation.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  return reduced;
};
