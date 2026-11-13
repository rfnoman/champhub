import { getTranslations } from "next-intl/server";

import { getServerApiClient } from "@/lib/api/server";

import { IdentityReviewQueue } from "./review-queue";

export const metadata = { title: "Identity · ChampHub admin" };

const FILTERS = ["submitted", "approved", "rejected", "draft"] as const;

export default async function AdminIdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  // `searchParams` is a promise in Next 16.
  const { status, q } = await searchParams;

  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/admin/identity-verifications", {
    params: { query: { ...(status ? { status } : {}), ...(q ? { q } : {}) } },
  });

  const t = await getTranslations("adminIdentity");

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
            href={`/admin/identity?status=${option}`}
            className={
              (status ?? "submitted") === option
                ? "bg-brand text-brand-foreground press rounded-full px-3 py-1.5 text-xs font-semibold"
                : "hover:bg-muted press rounded-full px-3 py-1.5 text-xs"
            }
          >
            {t(`status.${option}`)}
          </a>
        ))}
      </nav>

      <IdentityReviewQueue checks={data?.results ?? []} />
    </div>
  );
}
