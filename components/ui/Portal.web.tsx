import { createPortal } from 'react-dom';

/**
 * Web: renders its children into document.body, above the app's own layers
 * (sidebar, tab scenes), while keeping React context. Native: Portal.tsx.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
