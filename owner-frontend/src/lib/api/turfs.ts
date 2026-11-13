import { cache } from "react";

import { getServerApiClient } from "./server";
import type { OwnerTurf } from "./types";

/**
 * The turf being managed, fetched once per request.
 *
 * Both the turf layout and the page inside it need the turf: the layout for the heading
 * and the tab strip, the page for its own data. React's `cache()` is what stops that
 * being two round trips — it memoises per request, so the second caller gets the first
 * caller's promise. `fetch` deduplication cannot be relied on here: the Data Cache is
 * off (`cacheComponents: false`, DECISIONS D14) and these calls carry an Authorization
 * header, so they are never cached responses.
 */
export const getOwnerTurf = cache(async (slug: string): Promise<OwnerTurf | null> => {
  const api = await getServerApiClient();
  const { data } = await api.GET("/api/v1/me/turfs/{slug}", { params: { path: { slug } } });
  return data ?? null;
});
