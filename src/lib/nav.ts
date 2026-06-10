import type { NavItem } from '@/components';

/** The signed-in app's primary nav — one definition, every page agrees. */
export const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Pools', href: '/pools' },
];
