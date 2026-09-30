import { useEffect, useRef, useState } from 'react';
import { motion } from '../styles/tokens';
import { useReducedMotion } from './useReducedMotion';

/** Ease-out cubic: fast start, gentle settle. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Returns a number that counts from its current value to `target` whenever
 * `target` changes (DESIGN.md §2.4 motion). The first render shows `target`
 * as-is; an interrupted count restarts from wherever it had reached. With
 * reduced motion, or `enabled` false, the value jumps straight to `target`.
 */
export const useCountUp = (target: number, enabled = true): number => {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (!enabled || reduced || from === target || !Number.isFinite(target)) {
      current.current = target;
      setDisplay(target);
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / motion.count);
      const value = t === 1 ? target : from + (target - from) * easeOut(t);
      current.current = value;
      setDisplay(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, reduced]);

  return enabled ? display : target;
};
