import { flushSync } from 'react-dom';
import { motion } from '../styles/tokens';

/**
 * Web: cross-fade the whole page between light and dark with the View
 * Transitions API (the browser snapshots the old page, applies the update,
 * then fades between the two). Browsers without it switch instantly.
 * Returns whether it animated.
 */
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

const STYLE_ID = 'theme-crossfade';

export function crossfadeTheme(apply: () => void): boolean {
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== 'function') {
    apply();
    return false;
  }
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-duration: ${motion.theme}ms;
        animation-timing-function: ease-in-out;
      }
    `;
    doc.head.appendChild(style);
  }
  // The update has to land synchronously so the browser captures the new theme.
  doc.startViewTransition(() => flushSync(apply));
  return true;
}
