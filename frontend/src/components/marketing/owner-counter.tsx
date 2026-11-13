import { getTranslations } from "next-intl/server";

import { Money } from "@/components/ui/money";

/**
 * The owner's pitch, in the owner's own language.
 *
 * Turf owners are the side of this marketplace that does not browse: they are at the
 * counter, and what they want to know is what tonight is worth and what still needs
 * doing. So rather than a second round of benefit copy, this is tonight's sheet —
 * slots sold, cash in the drawer, counter sales, and the reservations still waiting on
 * a confirmation (DOMAIN §5, the two-hour window).
 *
 * Right-aligned figures in tabular numerals, because the only thing anyone does with
 * this table is run their eye down the column.
 */
export async function OwnerCounter() {
  const t = await getTranslations("home");

  const rows = [
    { label: t("counterSlots"), value: t("counterSlotsValue", { sold: 6, total: 8 }) },
    { label: t("counterCash"), value: <Money amount="14200.00" className="font-semibold" /> },
    { label: t("counterSales"), value: <Money amount="2850.00" className="font-semibold" /> },
    { label: t("counterToConfirm"), value: "2" },
  ];

  return (
    <div className="glass-panel flex w-full flex-col gap-3 rounded-2xl p-5 sm:max-w-sm">
      <span className="label-sm">{t("counterTitle")}</span>
      <span aria-hidden className="chalk-line h-px w-full" />
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="num font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
