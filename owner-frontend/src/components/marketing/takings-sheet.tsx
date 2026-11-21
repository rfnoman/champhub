import { getTranslations } from "next-intl/server";

import { Money } from "@/components/ui/money";

/**
 * Tonight's sheet, in the hero.
 *
 * A turf owner is not browsing — they are at a counter with a queue in front of them,
 * and the question they actually have is what tonight is worth. So the thing beside
 * the headline is the answer to that question rather than a photograph of a pitch:
 * slots sold against slots there are, the drawer, counter sales, and the reservations
 * still inside their two-hour confirm window (DOMAIN §5).
 *
 * Right-aligned figures in tabular numerals, because the only thing anyone does with a
 * column of money is run their eye down it. The confirm row is the one that earns its
 * place: it is the only line here that is a job rather than a number.
 */
export async function TakingsSheet() {
  const t = await getTranslations("ownerHome");

  const rows = [
    { label: t("sheetSlots"), value: t("sheetSlotsValue", { sold: 6, total: 8 }) },
    { label: t("sheetDrawer"), value: <Money amount="14200.00" className="font-semibold" /> },
    { label: t("sheetCounter"), value: <Money amount="2850.00" className="font-semibold" /> },
  ];

  return (
    <div className="glass-panel flex w-full flex-col gap-3 rounded-2xl p-5 sm:max-w-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-sm">{t("sheetTitle")}</span>
        <span className="text-muted-foreground text-xs">{t("sheetTurf")}</span>
      </div>
      <span aria-hidden className="chalk-line h-px w-full" />
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="num font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
      <span aria-hidden className="chalk-line h-px w-full" />
      {/* Not a number but a task: the two reservations that will expire if nobody
          touches them. It is the line an owner opens the app for. */}
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{t("sheetToConfirm")}</span>
        <span className="text-brand num font-semibold">{t("sheetToConfirmValue", { n: 2 })}</span>
      </div>
    </div>
  );
}
