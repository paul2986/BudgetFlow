/**
 * Shared top-level navigation definition (DESIGN.md §2.6).
 * One source for the bottom bar, nav rail, and sidebar so destinations,
 * icons, and labels never drift between form factors.
 */

export interface NavTab {
  route: string;
  label: string;
  icon: string;
  activeIcon: string;
}

export const NAV_TABS: NavTab[] = [
  { route: '/', label: 'Overview', icon: 'home-outline', activeIcon: 'home' },
  { route: '/expenses', label: 'Expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
  { route: '/people', label: 'People', icon: 'people-outline', activeIcon: 'people' },
  { route: '/tools', label: 'Tools', icon: 'calculator-outline', activeIcon: 'calculator' },
  { route: '/settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

/** Active when exactly on the tab route (top-level destinations only). */
export const isTabActive = (pathname: string, route: string): boolean =>
  route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(route + '/');
