/**
 * Native: no DOM to portal into, so children render in place. The web
 * version (Portal.web.tsx) moves them into document.body.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
