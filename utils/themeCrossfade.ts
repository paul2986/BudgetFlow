/**
 * Native has no page snapshot to cross-fade, so this just applies the change
 * and reports that it didn't animate; ThemeProvider covers the switch with a
 * veil in the old background that fades out. The web build uses
 * themeCrossfade.web.ts.
 */
export function crossfadeTheme(apply: () => void): boolean {
  apply();
  return false;
}
