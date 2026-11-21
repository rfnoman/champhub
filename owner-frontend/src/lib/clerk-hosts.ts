/**
 * The Clerk origins the content policy has to allow.
 *
 * These were hardcoded as `https://*.clerk.accounts.dev https://*.clerk.com`, which is
 * right for a *development* instance and wrong for every production one. A production
 * instance is served from a custom domain — `clerk.champhub.fit` — which matches
 * neither pattern, so `connect-src` blocked every call clerk-js made to its own
 * Frontend API. The sign-in form still rendered (its chunks are scripts, and
 * `script-src` allows `https:`), the environment fetch was blocked silently, clerk-js
 * fell back to an empty environment, and the result was a sign-in box with no social
 * buttons that could not have signed anybody in. Nothing appeared in the server logs,
 * because nothing reached a server.
 *
 * So the host is derived from the publishable key rather than written down. Clerk
 * encodes its Frontend API host in the key itself — base64 after the `pk_test_` /
 * `pk_live_` prefix, with a trailing `$` — which is how clerk-js finds it too. One
 * source of truth, and switching instances cannot leave the policy behind.
 */

/** The Frontend API origin a publishable key points at, or null if it is unreadable. */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const key = publishableKey?.trim();
  if (!key) return null;

  const encoded = key.split("_").slice(2).join("_");
  if (!encoded) return null;

  let host: string;
  try {
    host = atob(encoded).replace(/\$$/, "");
  } catch {
    // A malformed key is a deployment mistake, but it must not take the whole policy
    // down with it: fall back to the wildcards below and let Clerk report the bad key.
    return null;
  }

  // A decoded value that is not a hostname means the key is not what we think it is.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}

/**
 * The space-separated host list for `connect-src` and `frame-src`.
 *
 * The development wildcards stay regardless: they cost nothing, and they keep a local
 * checkout working when the key is absent. The account portal (`accounts.<domain>`) is
 * included because Clerk's hosted sign-in lives there and both apps redirect to it.
 */
export function clerkCspHosts(publishableKey: string | undefined): string {
  const hosts = ["https://*.clerk.accounts.dev", "https://*.clerk.com"];

  const origin = clerkFrontendApiOrigin(publishableKey);
  if (origin) {
    hosts.push(origin);
    // `clerk.example.com` -> `https://accounts.example.com`
    const accounts = origin.replace(/^https:\/\/clerk\./, "https://accounts.");
    if (accounts !== origin) hosts.push(accounts);
  }

  return hosts.join(" ");
}
