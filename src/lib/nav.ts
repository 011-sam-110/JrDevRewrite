import type { NavItem } from '@/components';

/** The signed-in app's primary nav — one definition, every page agrees. */
export const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Pools', href: '/pools' },
  { label: 'Battles', href: '/battles' },
  { label: 'Leaderboard', href: '/leaderboard' },
];

/** The operator console's nav — shared by the draft-approval and flag-review pages. */
export const OPERATOR_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Pools', href: '/operator/pools' },
  { label: 'Flags', href: '/operator/flags' },
  { label: 'Problems', href: '/operator/problems' },
];
