import { getTranslations } from "next-intl/server";

import { GuestLookup } from "./lookup";

export const metadata = {
  title: "Your bookings · ChampHub",
  // Nothing to index: the page is empty until somebody types their own number and code.
  robots: { index: false, follow: false },
};

/**
 * Where somebody with no account reads the booking a turf took for them (tasks.md).
 *
 * Outside every route group on purpose. `(player)` is behind `auth.protect()` (DOMAIN
 * §1, DECISIONS D12) and the whole point of this page is a person who has never signed
 * up — so it sits at the top level, like `/legal` and `/offline`, and is the one
 * booking route in the app that does not require a session.
 */
export default async function GuestPage() {
  const t = await getTranslations("guest");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
      </header>
      <GuestLookup />
    </div>
  );
}
