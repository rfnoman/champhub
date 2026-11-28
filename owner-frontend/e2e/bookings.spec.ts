import { dhakaDate } from "./support/booking";
import { apiBaseUrl } from "./support/clerk-users";
import { expect, requiresClerk, test } from "./support/fixtures";

/**
 * The till's side of a booking.
 *
 * Moved here with the rest of the owner surface (DECISIONS D83). The player's own
 * booking page keeps its half in the player app's `bookings.spec.ts`; this covers what
 * only staff can do.
 */
test.describe("the counter", () => {
  requiresClerk();

  test("the counter refuses a walk-in until the turf is approved", async ({
    signedInPage: page,
  }) => {
    // The turf is built through the API: this spec is about the *counter* flow, and
    // re-driving the whole registration UI here would only re-test Phase 02 while
    // making the failure message useless when something else breaks.
    const slug = await page.evaluate(async (base) => {
      const token = await (
        window as never as { Clerk: { session: { getToken(): Promise<string> } } }
      ).Clerk.session.getToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const turf = await (
        await fetch(`${base}/api/v1/me/turfs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: `E2E Counter Turf ${Date.now()}`,
            address: "Road 1, Dhanmondi",
            area: "Dhanmondi",
            latitude: 23.7465,
            longitude: 90.376,
          }),
        })
      ).json();

      for (let weekday = 0; weekday < 7; weekday += 1) {
        await fetch(`${base}/api/v1/me/turfs/${turf.slug}/hours`, {
          method: "POST",
          headers,
          body: JSON.stringify({ weekday, open_time: "06:00", close_time: "23:00" }),
        });
      }

      const sports = await (await fetch(`${base}/api/v1/sports`, { headers })).json();
      const football = sports.find((s: { slug: string }) => s.slug === "football");

      const ground = await (
        await fetch(`${base}/api/v1/me/turfs/${turf.slug}/grounds`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "Pitch",
            max_players: 10,
            slot_minutes: 60,
            sport_format_ids: [football.formats[0].id],
          }),
        })
      ).json();

      await fetch(`${base}/api/v1/me/turfs/${turf.slug}/grounds/${ground.id}/prices`, {
        method: "POST",
        headers,
        // Equal times mean the full 24 hours, so every open minute is priced.
        body: JSON.stringify({
          weekdays: [],
          start_time: "00:00",
          end_time: "00:00",
          price: "2000.00",
        }),
      });
      await fetch(`${base}/api/v1/me/turfs/${turf.slug}/grounds/${ground.id}/activate`, {
        method: "POST",
        headers,
      });

      return turf.slug as string;
    }, apiBaseUrl());

    await page.goto(`/turfs/${slug}/bookings?date=${dhakaDate(1)}`);

    // The form asks which kind of person is at the counter now (tasks.md); the name and
    // number belong to the guest half of it.
    await page.getByRole("tab", { name: "No account" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Karim Uddin");
    await page.getByLabel("Phone", { exact: true }).fill("+8801711222333");
    await page.getByLabel("Start time").fill("10:00");
    await page.getByRole("button", { name: "Book", exact: true }).click();

    // The turf is still a draft, and only an approved turf takes bookings — including
    // at its own counter. What this asserts is that the API's reason reaches the
    // cashier rather than failing silently.
    //
    // Approving needs a platform admin, which an end-to-end run cannot grant itself,
    // so the rest of the counter flow (walk-in -> confirmed -> paid) is covered by the
    // backend tests in apps/bookings/tests/test_api.py.
    await expect(page.getByRole("alert").first()).toContainText("not accepting bookings");
    await expect(page.getByText("Karim Uddin")).toHaveCount(0);
  });
});
