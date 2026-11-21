import { getTranslations } from "next-intl/server";

import { Money } from "@/components/ui/money";

/**
 * One sale at the counter, printed.
 *
 * Selling at a turf is not e-commerce: it is a boy at the hatch wanting a bottle of
 * water and a pair of bibs while nine other people wait. So the fragment that stands
 * for the counter is a receipt — the shape the transaction already has in the owner's
 * head — rather than a product grid.
 *
 * Two details are the point rather than the decoration. The rental line comes *back*,
 * which is what separates gear from stock and is why the counter tracks it separately
 * (Phase 07). And the stock note under the total is the counter doing the job an owner
 * otherwise does with a notebook at midnight: every sale moves the shelf.
 */
export async function CounterReceipt() {
  const t = await getTranslations("ownerHome");

  const lines = [
    { item: t("receiptWater"), qty: "×2", amount: "80.00" },
    { item: t("receiptBall"), qty: "×1", amount: "1200.00" },
  ];

  return (
    <div className="bg-card/60 flex w-full flex-col gap-3 rounded-2xl border p-5 sm:max-w-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-sm">{t("receiptTitle")}</span>
        <span className="text-muted-foreground num text-xs">{t("receiptTime")}</span>
      </div>
      <span aria-hidden className="chalk-line h-px w-full" />

      <dl className="flex flex-col gap-2 text-sm">
        {lines.map((line) => (
          <div key={line.item} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground flex items-baseline gap-2">
              <span>{line.item}</span>
              <span className="num text-xs opacity-70">{line.qty}</span>
            </dt>
            <dd className="num font-medium">
              <Money amount={line.amount} />
            </dd>
          </div>
        ))}
        {/* Gear, not stock: it goes out and it is expected back, so it is counted in
            a different column and the receipt says so rather than quietly charging
            for a jersey nobody sold. */}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground flex items-baseline gap-2">
            <span>{t("receiptBibs")}</span>
            <span className="num text-xs opacity-70">×10</span>
          </dt>
          <dd className="text-brand text-xs font-medium">{t("receiptOnLoan")}</dd>
        </div>
      </dl>

      <span aria-hidden className="chalk-line h-px w-full" />
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-sm font-bold">{t("receiptTotal")}</span>
        <span className="num font-display text-lg font-bold">
          <Money amount="1280.00" />
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{t("receiptStockNote")}</p>
    </div>
  );
}
