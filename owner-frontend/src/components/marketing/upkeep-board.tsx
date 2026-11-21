import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";

/**
 * The jobs that are not a sale: who can open up, and when the ground is shut.
 *
 * Staff are the half of running a turf that software usually ignores, and they are the
 * reason an owner can go home. Roles are permissions on one ordinary account rather
 * than a separate kind of user (DOMAIN §1), so the cashier on this list is somebody
 * who also plays here — which is exactly how it works in real turfs and worth showing
 * rather than explaining.
 *
 * The closure underneath is the other half: a ground that is shut for resurfacing has
 * to stop taking bookings by itself, because the owner who remembers to block it is
 * the owner who already lost the Friday.
 */
export async function UpkeepBoard() {
  const t = await getTranslations("ownerHome");

  const staff = [
    { name: t("staffOwnerName"), role: t("staffOwner"), active: true },
    { name: t("staffManagerName"), role: t("staffManager"), active: true },
    { name: t("staffCashierName"), role: t("staffCashier"), active: false },
  ];

  return (
    <div className="bg-card/60 flex w-full flex-col gap-4 rounded-2xl border p-5 sm:max-w-sm">
      <span className="label-sm">{t("upkeepStaffTitle")}</span>
      <ul className="flex flex-col gap-2.5">
        {staff.map((person) => (
          <li key={person.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium">{person.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{person.role}</span>
            </span>
            {/* An invitation that has not been accepted is not staff yet, and the
                board has to say so or an owner counts on somebody who cannot open up. */}
            {person.active ? null : <Badge variant="secondary">{t("staffInvited")}</Badge>}
          </li>
        ))}
      </ul>

      <span aria-hidden className="chalk-line h-px w-full" />

      <div className="flex flex-col gap-1.5">
        <span className="label-sm">{t("upkeepClosedTitle")}</span>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{t("upkeepClosedReason")}</span>
          <span className="num shrink-0 text-xs">{t("upkeepClosedWhen")}</span>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{t("upkeepClosedNote")}</p>
      </div>
    </div>
  );
}
