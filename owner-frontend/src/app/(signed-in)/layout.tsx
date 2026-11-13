import { auth } from "@clerk/nextjs/server";

import { PageContainer } from "@/components/layout/page-container";

/**
 * The gate for the whole owner app.
 *
 * Everything in this group is one turf's private operations, so the check is here
 * rather than in `src/proxy.ts`: Clerk deprecated `createRouteMatcher` after the 2025
 * middleware-bypass disclosures and now recommends gating as close to the data as
 * possible (DECISIONS D12). Only `/sign-in` and `/sign-up` sit outside this group.
 *
 * Holding an owner or staff `TurfMembership` is not checked here — the API decides that
 * per turf, and a signed-in player with no turf yet is a legitimate visitor: the
 * dashboard's job is to offer them the registration form.
 *
 * `wide` throughout: this app is tables, settings panels and a till, not a reading
 * column.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <PageContainer width="wide">{children}</PageContainer>;
}
