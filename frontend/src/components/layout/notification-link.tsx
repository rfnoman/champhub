import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A notification's target, which may not be in this app.
 *
 * Most notification URLs are paths into the player app. Two are not: low stock and an
 * order waiting at a turf's counter are aimed at staff, and those screens moved to the
 * owner app (DECISIONS D83), so the backend sends an absolute URL for them.
 *
 * `<Link>` cannot carry those. Given another origin it hands the href to the client
 * router, which has no route for it — so the reader gets this app's own 404 instead of
 * leaving, which looks like a broken notification rather than a crossing. Anything with
 * a scheme therefore renders as a plain anchor.
 */
export function NotificationLink({
  url,
  className,
  onNavigate,
  children,
}: {
  url: string;
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  if (/^https?:\/\//i.test(url)) {
    return (
      <a href={url} className={className} onClick={onNavigate}>
        {children}
      </a>
    );
  }

  return (
    <Link href={url} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}
