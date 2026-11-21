import { describe, expect, it } from "vitest";

import { clerkCspHosts, clerkFrontendApiOrigin } from "../clerk-hosts";

/**
 * The policy has to name the instance this deployment actually talks to.
 *
 * The bug this guards against shipped to production and was invisible everywhere it
 * would normally be caught: `connect-src` listed only `*.clerk.accounts.dev` and
 * `*.clerk.com`, so against a production instance on a custom domain the browser
 * blocked every Frontend API call. The sign-in form still rendered, nothing reached a
 * server, and no log anywhere had a line in it — the only symptom was a sign-in box
 * that could not sign anybody in.
 */

/** The real shape: base64 of the Frontend API host with a trailing `$`. */
function publishableKey(prefix: "pk_test" | "pk_live", host: string): string {
  return `${prefix}_${btoa(`${host}$`)}`;
}

describe("clerkFrontendApiOrigin", () => {
  it("reads the host out of a production key", () => {
    expect(clerkFrontendApiOrigin(publishableKey("pk_live", "clerk.champhub.fit"))).toBe(
      "https://clerk.champhub.fit",
    );
  });

  it("reads the host out of a development key", () => {
    expect(
      clerkFrontendApiOrigin(publishableKey("pk_test", "just-honeybee-8793.clerk.accounts.dev")),
    ).toBe("https://just-honeybee-8793.clerk.accounts.dev");
  });

  it.each([undefined, "", "   ", "pk_live_", "not-a-key", "pk_live_!!!not-base64!!!"])(
    "returns null rather than throwing for %p",
    (key) => {
      expect(clerkFrontendApiOrigin(key as string | undefined)).toBeNull();
    },
  );

  it("rejects a key that decodes to something which is not a hostname", () => {
    expect(clerkFrontendApiOrigin(`pk_live_${btoa("hello world$")}`)).toBeNull();
  });
});

describe("clerkCspHosts", () => {
  it("names the production instance and its account portal", () => {
    const hosts = clerkCspHosts(publishableKey("pk_live", "clerk.champhub.fit"));

    // The one that was missing, and the hosted sign-in both apps redirect to.
    expect(hosts).toContain("https://clerk.champhub.fit");
    expect(hosts).toContain("https://accounts.champhub.fit");
  });

  it("keeps the development wildcards so a local checkout still works", () => {
    const hosts = clerkCspHosts(publishableKey("pk_live", "clerk.champhub.fit"));

    expect(hosts).toContain("https://*.clerk.accounts.dev");
    expect(hosts).toContain("https://*.clerk.com");
  });

  it("falls back to the wildcards alone when there is no key", () => {
    expect(clerkCspHosts(undefined)).toBe("https://*.clerk.accounts.dev https://*.clerk.com");
  });

  it("adds no account portal for a development host, which has none", () => {
    const hosts = clerkCspHosts(publishableKey("pk_test", "just-honeybee-8793.clerk.accounts.dev"));

    expect(hosts).toContain("https://just-honeybee-8793.clerk.accounts.dev");
    expect(hosts).not.toContain("https://accounts.");
  });
});
