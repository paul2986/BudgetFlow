import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from 'expo-router';
import { confirmDiscard } from '../utils/alert';

/**
 * Web: the browser back button asks "Discard changes?" just like the header ✕.
 *
 * Browser back can't be cancelled, and expo-router answers it with a
 * resetRoot (no beforeRemove to veto). So while the form is focused and
 * dirty, a guard history entry with the same URL and router id sits on top.
 * Back pops onto the real entry beneath; our popstate listener swallows that
 * before the router sees it, so the router never moves, and we ask. Keep
 * editing re-pushes the guard; Discard goes back for real.
 *
 * Any programmatic navigation away (save, delete, ✕) must go through the
 * returned `leave`, which drops the guard first. Otherwise the router would
 * replace the guard entry and leave a stale copy of the form underneath.
 *
 * Tab screens stay mounted after they blur, hence the focus check.
 */

const GUARD = '__bfDiscardGuard';

const onGuardEntry = () => !!window.history.state?.[GUARD];

/** Returns true when it handled the pop and the router must not see it. */
type PopHandler = (e: PopStateEvent) => boolean;
const handlers = new Set<PopHandler>();

// The armed guard's drop function, if any (only the focused form arms one).
let armedDrop: ((then: () => void) => void) | null = null;

/**
 * Navigate away from wherever the user is (tab bar, sidebar, rail) without
 * leaving a form's guard entry buried in history: drop it first, then run
 * `navigate`. The drop has to finish before the router pushes, since
 * history.back() is async and would otherwise rewind the router's new entry.
 */
export function releaseDiscardGuard(navigate: () => void): void {
  if (armedDrop) armedDrop(navigate);
  else navigate();
}

// Registered when this module loads (app/_layout imports it), i.e. before
// expo-router adds its own popstate listener in an effect after first render.
// Listeners on window fire in registration order (capture: true does not jump
// the queue in Chromium; measured), so going first is what lets
// stopImmediatePropagation hide a handled pop from the router.
if (Platform.OS === 'web' && typeof window !== 'undefined' && !(window as any)[GUARD]) {
  (window as any)[GUARD] = true;
  window.addEventListener('popstate', (e) => {
    for (const handle of handlers) {
      if (handle(e)) {
        e.stopImmediatePropagation();
        return;
      }
    }
  });
}

export function useDiscardGuard(dirty: boolean): (then: () => void) => void {
  const isFocused = useIsFocused();
  const active = Platform.OS === 'web' && dirty && isFocused;

  // True while our guard entry is on top of the history stack.
  const guarded = useRef(false);
  // Where the guard sits: back from it must land on this URL and router id.
  const guardedAt = useRef<{ href: string; id: unknown } | null>(null);
  // Set while we pop our own guard; that popstate is ours, not the user's.
  const pendingPop = useRef<(() => void) | null>(null);
  // This instance's dropGuard, for the module-level releaseDiscardGuard.
  const dropRef = useRef<((then?: () => void) => void) | null>(null);
  // Whether the screen is focused as of the latest render (read in cleanup).
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;

  const pushGuard = useCallback(() => {
    if (!onGuardEntry()) {
      window.history.pushState({ ...window.history.state, [GUARD]: true }, '', window.location.href);
    }
    guardedAt.current = { href: window.location.href, id: window.history.state?.id };
    guarded.current = true;
    armedDrop = dropRef.current;
  }, []);

  const dropGuard = useCallback((then?: () => void) => {
    const done = then ?? (() => {});
    guarded.current = false;
    if (armedDrop === dropRef.current) armedDrop = null;
    // Already popping (e.g. a save cleared `dirty` just as it navigates):
    // wait for that pop rather than going back a second step.
    const inFlight = pendingPop.current;
    if (inFlight) {
      pendingPop.current = () => {
        inFlight();
        done();
      };
      return;
    }
    if (Platform.OS !== 'web' || !onGuardEntry()) {
      done();
      return;
    }
    pendingPop.current = done;
    window.history.back();
    // popstate should arrive within a frame or two; don't strand the caller if it never does.
    setTimeout(() => {
      const pending = pendingPop.current;
      if (pending) {
        pendingPop.current = null;
        pending();
      }
    }, 500);
  }, []);

  dropRef.current = dropGuard;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPop: PopHandler = () => {
      if (pendingPop.current) {
        const done = pendingPop.current;
        pendingPop.current = null;
        done();
        return true;
      }
      if (!guarded.current) return false;
      guarded.current = false;
      if (armedDrop === dropRef.current) armedDrop = null;
      // One step back from the guard lands on the same URL and router id, so
      // the router has nothing to do. Anything else (a multi-step jump from
      // the history menu) is a real navigation: let the router handle it.
      const at = guardedAt.current;
      if (!at || onGuardEntry() || window.location.href !== at.href || window.history.state?.id !== at.id) {
        return false;
      }
      confirmDiscard(true, () => window.history.back(), pushGuard);
      return true;
    };
    handlers.add(onPop);
    return () => {
      handlers.delete(onPop);
    };
  }, [pushGuard]);

  useEffect(() => {
    if (!active) return;
    // Arm a tick later: the router writes the new screen's URL after focus
    // changes, and a dirty flag that flickers on mount never touches history.
    const timer = setTimeout(pushGuard, 0);
    return () => {
      clearTimeout(timer);
      if (!guarded.current) return;
      if (focusedRef.current) {
        // Still on screen, just no longer dirty (edits undone): drop it.
        dropGuard();
      } else {
        // Lost focus to a navigation we didn't route through leave() or
        // releaseDiscardGuard. The router is about to push its own entry, and
        // an async back() now would rewind that instead, so leave the guard
        // buried: at worst back needs one extra press.
        guarded.current = false;
        if (armedDrop === dropGuard) armedDrop = null;
      }
    };
  }, [active, pushGuard, dropGuard]);

  return dropGuard;
}
