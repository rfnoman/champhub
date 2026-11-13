import { getTranslations } from "next-intl/server";

import { playerAppUrl } from "@/lib/links";

/**
 * The footer exists for one reason: the policy pages have to be reachable.
 *
 * A refund policy nobody can find is not a policy, and SSLCommerz's merchant onboarding
 * asks for links that resolve from the site itself (Phase 11 step 7). The owner terms
 * come first here — it is the document this audience actually signs up to.
 *
 * The documents themselves are not duplicated into this app: they are one set of
 * policies served by the player app, so these are absolute links to that origin. Slugs
 * are hard-coded rather than imported from a catalogue, which is the trade for not
 * copying four legal texts into a second deployment — `legal.spec.ts` in the player app
 * asserts each one resolves.
 */
const LEGAL_SLUGS = ["owners", "terms", "privacy", "refunds"] as const;

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const player = playerAppUrl();

  return (
    <footer className="mt-12 border-t">
      <div className="text-muted-foreground page-column flex flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        <nav className="flex flex-wrap gap-4">
          {LEGAL_SLUGS.map((slug) => (
            <a
              key={slug}
              href={`${player}/legal/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {t(`legal.${slug}`)}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
