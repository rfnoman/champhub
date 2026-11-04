import {
  CalendarCheck,
  Dumbbell,
  Home,
  MapPin,
  ShoppingBag,
  Store,
  Swords,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** Key under the `nav` namespace. */
  key: string;
  icon: LucideIcon;
};

/**
 * One source of truth for navigation, shared by the desktop header, the mobile tab bar
 * and the "more" sheet — so the three cannot drift.
 *
 * `PRIMARY` is deliberately five items. It is what fits a 390px tab bar with Bengali
 * labels, which run 20–30% longer than the English, and it is the five things a player
 * opens the app to do. Everything else is reachable, just not one tap away.
 */
export const PRIMARY: NavItem[] = [
  { href: "/home", key: "home", icon: Home },
  { href: "/play", key: "play", icon: Swords },
  { href: "/turfs", key: "findTurf", icon: MapPin },
  { href: "/bookings", key: "myBookings", icon: CalendarCheck },
  { href: "/profile", key: "profile", icon: User },
];

export const SECONDARY: NavItem[] = [
  { href: "/activity", key: "activity", icon: Dumbbell },
  { href: "/squads", key: "squads", icon: Users },
  { href: "/store", key: "store", icon: ShoppingBag },
  { href: "/owner", key: "owner", icon: Store },
];

/**
 * Whether a nav item should read as current.
 *
 * Prefix matching, so `/bookings/abc123` still highlights Bookings — but anchored on a
 * segment boundary, or `/play` would also claim `/players`.
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
