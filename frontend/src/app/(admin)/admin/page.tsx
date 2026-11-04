import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LifeBuoy,
  MapPin,
  ShieldAlert,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The admin index.
 *
 * It was a heading and eight bare buttons in a row, which told an admin what pages
 * exist but nothing about which one needs them. Each destination now carries what it
 * is for, so the queues read as work rather than as navigation.
 */
const SECTIONS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: "/admin/dashboard", key: "navDashboard", icon: BarChart3 },
  { href: "/admin/turfs", key: "navTurfs", icon: MapPin },
  { href: "/admin/sports", key: "navSports", icon: Trophy },
  { href: "/admin/conduct", key: "navConduct", icon: ShieldAlert },
  { href: "/admin/orders", key: "navOrders", icon: ClipboardList },
  { href: "/admin/warehouse", key: "navWarehouse", icon: Boxes },
  { href: "/admin/finance", key: "navFinance", icon: Wallet },
  { href: "/admin/support", key: "navSupport", icon: LifeBuoy },
];

export default async function AdminPage() {
  const t = await getTranslations("admin");

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="press glass-panel hover:border-brand/40 flex h-full items-start gap-3 rounded-2xl p-4"
            >
              <span className="bg-brand/12 text-brand flex size-9 shrink-0 items-center justify-center rounded-xl">
                <section.icon className="size-4.5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-sm font-semibold tracking-tight">
                  {t(section.key)}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {t(`${section.key}Hint`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
