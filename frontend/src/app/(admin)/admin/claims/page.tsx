import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";

import { ClaimQueue } from "./claim-queue";

export const metadata = { title: "Account claims · ChampHub admin" };

const FILTERS = ["pending", "approved", "rejected", "withdrawn"] as const;

/**
 * People asking for the booking history they made before they had an account (tasks.md).
 *
 * A review queue rather than an automatic join, and the review is the entire security
 * model: a phone number is unverified (DECISIONS D9), so a matching string is a hint.
 * Approving hands one person another's match history, so a person decides and the
 * decision records who they were.
 */
export default async function AdminClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // `searchParams` is a promise in Next 16.
  const { status } = await searchParams;

  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/admin/account-claims", {
    params: { query: status ? { status } : {} },
  });

  const t = await getTranslations("adminClaims");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label={t("filter")}>
        {FILTERS.map((option) => (
          <a
            key={option}
            href={`/admin/claims?status=${option}`}
            className={
              (status ?? "pending") === option
                ? "bg-brand text-brand-foreground press rounded-full px-3 py-1.5 text-xs font-semibold"
                : "hover:bg-muted press rounded-full px-3 py-1.5 text-xs"
            }
          >
            {t(`status.${option}`)}
          </a>
        ))}
      </nav>

      <ClaimQueue claims={data ?? []} readOnly={(status ?? "pending") !== "pending"} />
    </div>
  );
}
