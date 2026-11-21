import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";

/**
 * Getting listed, in three panels.
 *
 * Numbered because it genuinely is a sequence — nobody can book a ground that has not
 * been reviewed — which is the only condition under which numbered markers carry
 * information rather than decorate.
 *
 * Each panel holds a fragment of the real product rather than an illustration: the
 * draft with its grounds, the review badge the dashboard actually shows, and a night's
 * hours with a price band on it. The review step is deliberately not hidden. An owner
 * who finds out about it *after* filling in six screens feels ambushed; one who is
 * told up front reads it as the reason the listings are worth being in. Nothing
 * animates here — the hero has the page's one orchestrated moment (D72).
 */
export async function RegisterJourney() {
  const t = await getTranslations("ownerHome");

  const steps = [
    { title: t("step1Title"), body: t("step1Body"), panel: <DraftPanel /> },
    { title: t("step2Title"), body: t("step2Body"), panel: <ReviewPanel /> },
    { title: t("step3Title"), body: t("step3Body"), panel: <HoursPanel /> },
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

async function DraftPanel() {
  const t = await getTranslations("ownerHome");

  return (
    <div className="bg-card/60 flex flex-col gap-2 rounded-xl border p-4">
      <span className="font-display text-sm font-bold">{t("panelTurfName")}</span>
      <span className="text-muted-foreground text-xs">{t("panelArea")}</span>
      <span aria-hidden className="chalk-line my-1 h-px w-full" />
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("panelGroundA")}</span>
          <span className="num">{t("panelFormat7")}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("panelGroundB")}</span>
          <span className="num">{t("panelFormat5")}</span>
        </div>
      </div>
    </div>
  );
}

async function ReviewPanel() {
  const t = await getTranslations("ownerHome");

  return (
    <div className="bg-card/60 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-sm font-bold">{t("panelTurfName")}</span>
        {/* The same `secondary` tone the dashboard gives a turf under review, so the
            badge somebody meets here is the badge they will meet again. */}
        <Badge variant="secondary">{t("panelUnderReview")}</Badge>
      </div>
      <span aria-hidden className="chalk-line h-px w-full" />
      <ul className="text-muted-foreground flex flex-col gap-1.5 text-xs">
        <li className="flex items-center gap-2">
          <Tick />
          {t("panelCheckIdentity")}
        </li>
        <li className="flex items-center gap-2">
          <Tick />
          {t("panelCheckPhotos")}
        </li>
      </ul>
    </div>
  );
}

async function HoursPanel() {
  const t = await getTranslations("ownerHome");

  const rows = [
    { day: t("panelFri"), hours: "16:00 – 23:00", band: t("panelPeak") },
    { day: t("panelSat"), hours: "06:00 – 23:00", band: t("panelNight") },
  ];

  return (
    <div className="bg-card/60 flex flex-col gap-2 rounded-xl border p-4">
      <span className="label-sm">{t("panelHours")}</span>
      <span aria-hidden className="chalk-line h-px w-full" />
      <dl className="flex flex-col gap-1.5 text-xs">
        {rows.map((row) => (
          <div key={row.day} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{row.day}</dt>
            <dd className="num flex items-baseline gap-2">
              <span>{row.hours}</span>
              <span className="text-brand">{row.band}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A tick that is a mark, not an emoji: it has to sit on the text baseline. */
function Tick() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="text-brand size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6.5 L4.8 9.2 L10 3.4" />
    </svg>
  );
}
