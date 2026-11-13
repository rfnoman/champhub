import { getTranslations } from "next-intl/server";

import { Money } from "@/components/ui/money";

/**
 * How a match comes together, in three panels.
 *
 * Numbered, because this genuinely is a sequence — you cannot fill a match you have not
 * booked, or score one that has not been played — which is the only condition under
 * which numbered markers carry information rather than decorate.
 *
 * Each panel holds a *fragment of the real product* rather than an illustration: the
 * reservation with its confirm window, the roster with two requests waiting on the
 * leader, the scorecard with the rating it moved. The sequence is DOMAIN §5–§8, the
 * confirm window is `BOOKING_CONFIRM_WINDOW_HOURS = 2`, and the players are the seeded
 * ones. Nothing animates: the hero has the page's one orchestrated moment, and three
 * cards fading up on scroll is the commonest tell of a generated page.
 */
export async function MatchJourney() {
  const t = await getTranslations("home");

  const steps = [
    { title: t("step1Title"), body: t("step1Body"), panel: <BookedPanel /> },
    { title: t("step2Title"), body: t("step2Body"), panel: <RosterPanel /> },
    { title: t("step3Title"), body: t("step3Body"), panel: <ScorecardPanel /> },
  ];

  return (
    <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
      {steps.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-3">
          {/* The number sits *on* the chalk rule rather than floating above the
              heading, so the marker and the division it marks are one object. */}
          <div className="flex items-center gap-3">
            <span className="num text-brand text-sm font-semibold">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span aria-hidden className="chalk-line h-px flex-1" />
          </div>
          <h3 className="font-display text-lg font-bold tracking-tight">{step.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
          <div className="mt-1">{step.panel}</div>
        </li>
      ))}
    </ol>
  );
}

/** Shared shell, so the three fragments read as three views of one product. */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="glass-panel flex flex-col gap-3 rounded-2xl p-4 text-sm">{children}</div>;
}

/** 01 — the slot is held, and the clock the confirm window runs on. */
async function BookedPanel() {
  const t = await getTranslations("home");

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num font-display text-lg font-bold">21:00</span>
        <Money amount="3000.00" className="font-semibold" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-medium">{t("turf_dhanmondi")}</span>
        <span className="text-muted-foreground text-xs">{t("ground_mainPitch")}</span>
      </div>
      <span aria-hidden className="chalk-line h-px w-full" />
      <div className="flex items-center gap-2">
        <span className="bg-brand size-1.5 rounded-full" aria-hidden />
        <span className="text-brand text-xs font-medium">{t("panelReserved")}</span>
        <span className="text-muted-foreground num ml-auto text-xs">{t("panelConfirmWindow")}</span>
      </div>
    </Panel>
  );
}

/** 02 — nine in, and two players waiting on the leader. */
async function RosterPanel() {
  const t = await getTranslations("home");
  const requests = [
    { name: "Shuvo Rahman", position: t("panelKeeper") },
    { name: "Nabila Hossain", position: t("panelAllRounder") },
  ];

  return (
    <Panel>
      <div className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 14 }, (_, dot) => (
          <span
            key={dot}
            className={
              dot < 9
                ? "bg-brand/45 h-5 flex-1 rounded-full"
                : "border-muted-foreground/40 h-5 flex-1 scale-x-75 rounded-full border border-dashed"
            }
          />
        ))}
      </div>
      <span className="num text-muted-foreground text-xs">
        {t("rosterState", { joined: 9, needed: 5 })}
      </span>
      <span aria-hidden className="chalk-line h-px w-full" />
      <ul className="flex flex-col gap-1.5">
        {requests.map((request) => (
          <li key={request.name} className="flex items-baseline gap-2 text-xs">
            <span className="font-medium">{request.name}</span>
            <span className="text-muted-foreground">{request.position}</span>
            <span className="text-brand ml-auto">{t("panelAsksToJoin")}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** 03 — the result, and the rating it moved. */
async function ScorecardPanel() {
  const t = await getTranslations("home");

  return (
    <Panel>
      <div className="flex items-center justify-center gap-3">
        <span className="num font-display text-3xl font-extrabold">4</span>
        <span aria-hidden className="bg-foreground/25 h-px w-4" />
        <span className="num font-display text-muted-foreground text-3xl font-extrabold">3</span>
      </div>
      <span aria-hidden className="chalk-line h-px w-full" />
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">Rafi Ahmed</span>
        <span className="text-flare">{t("panelMotm")}</span>
      </div>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-muted-foreground">{t("sport_football")}</span>
        <span className="num text-rating-strong ml-auto font-semibold">66</span>
        <span className="num text-brand bg-brand/12 rounded-full px-1.5 py-0.5 font-semibold">
          +2
        </span>
      </div>
    </Panel>
  );
}
