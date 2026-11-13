import {
  CalendarDays,
  Package,
  Receipt,
  ScanLine,
  Settings2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type TurfTab = {
  /** Appended to `/turfs/<slug>`; the empty string is the turf's settings page. */
  segment: string;
  /** Key under the `ownerManage` namespace. */
  key: string;
  icon: LucideIcon;
  /** Whether the tab earns a place in the phone tab bar, which fits five. */
  mobile: boolean;
};

/**
 * One source of truth for a turf's destinations, shared by the desktop tab strip and
 * the phone tab bar — so the two cannot drift.
 *
 * Settings is the one tab left off the phone bar. Five is what fits a 390px bar with
 * Bengali labels, and the five that make the cut are the ones used with a queue
 * waiting; changing opening hours is not done one-handed at the counter.
 *
 * Rentals is deliberately absent from both: it belongs to inventory and is reached from
 * there, which keeps this list the length a tab bar can actually render.
 */
export const TURF_TABS: TurfTab[] = [
  { segment: "", key: "navSettings", icon: Settings2, mobile: false },
  { segment: "/bookings", key: "viewBookings", icon: CalendarDays, mobile: true },
  { segment: "/counter", key: "openCounter", icon: ScanLine, mobile: true },
  { segment: "/inventory", key: "viewInventory", icon: Package, mobile: true },
  { segment: "/orders", key: "viewOrders", icon: Receipt, mobile: true },
  { segment: "/finance", key: "viewFinance", icon: Wallet, mobile: true },
];

/**
 * The turf a path is inside, or null when the reader is on the dashboard or the
 * registration form.
 *
 * Used by the phone tab bar, which has no props to read the slug from — it renders once
 * in the root layout and has to work out its own context.
 */
export function turfSlugFrom(pathname: string): string | null {
  const match = /^\/turfs\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Whether a tab should read as current.
 *
 * The settings tab is the turf root, so it is an exact match — prefix matching would
 * light it up on every page of the turf. The rest match their own subtree, so
 * `/inventory` stays current while a product is being edited.
 */
export function isTabActive(pathname: string, href: string, segment: string): boolean {
  return segment === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
