"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type {
  Ground,
  GroundSportFormat,
  OperatingHours,
  OwnerTurf,
  SportFormat,
  Sport,
  TurfMembership,
} from "@/lib/api/types";
import { describe } from "@/lib/api/errors";
import { useApiClient } from "@/lib/api/use-api";
import { approxDuration, isPerMatch, matchUnitLabel } from "@/lib/match-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui/money";
import { TurfMap } from "@/components/turf/turf-map";

/** Monday-first, matching the backend's `date.weekday()` convention. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type Busy = string | null;

/**
 * Everything an owner does to a turf after registering it: grounds, opening hours,
 * price rules, staff, and submitting for review.
 *
 * One client component rather than five, because the pieces constrain each other —
 * activating a ground depends on the hours *and* the prices, and submitting depends on
 * all three. Keeping them together means one `router.refresh()` reconciles the lot.
 */
export function ManageTurf({
  turf,
  sports,
  staff,
}: {
  turf: OwnerTurf;
  sports: Sport[];
  staff: TurfMembership[];
}) {
  const t = useTranslations("ownerManage");
  const router = useRouter();

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = turf.my_role === "owner";
  const firstUndone = firstUndoneSection(turf, staff);

  async function run(key: string, call: () => Promise<{ error?: unknown }>) {
    setBusy(key);
    setError(null);
    const { error: apiError } = await call();
    setBusy(null);
    if (apiError) {
      // The backend's validation messages are the useful part — price coverage gaps,
      // missing hours — so they are surfaced verbatim rather than flattened to "error".
      setError(describe(apiError) ?? t("failed"));
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm whitespace-pre-line">
          {error}
        </p>
      )}

      <ReviewPanel turf={turf} isOwner={isOwner} busy={busy} run={run} />
      <LocationPanel
        turf={turf}
        isOwner={isOwner}
        busy={busy}
        run={run}
        open={firstUndone === "location"}
      />
      <GroundsPanel
        turf={turf}
        sports={sports}
        isOwner={isOwner}
        busy={busy}
        run={run}
        open={firstUndone === "grounds"}
      />
      <HoursPanel
        turf={turf}
        isOwner={isOwner}
        busy={busy}
        run={run}
        open={firstUndone === "hours"}
      />
      <StaffPanel
        turf={turf}
        staff={staff}
        isOwner={isOwner}
        busy={busy}
        run={run}
        open={firstUndone === "staff"}
      />
    </div>
  );
}

/**
 * The first section with something missing, which is the one that opens on arrival.
 *
 * The page used to be four cards unfolded at once — every control an owner has, all
 * shouting at the same volume, with the thing they actually had to do next buried
 * somewhere in the middle. Shut, each section says what state it is in; open, it is the
 * old card. So the page answers "what now?" before it offers thirty inputs.
 *
 * Order matters: a ground cannot be activated without hours and prices, so hours come
 * before staff and a turf with no grounds opens there regardless of anything else.
 */
function firstUndoneSection(turf: OwnerTurf, staff: TurfMembership[]) {
  if (turf.latitude == null) return "location";
  if (turf.grounds.length === 0) return "grounds";
  if (turf.operating_hours.length === 0) return "hours";
  if (!turf.grounds.some((ground) => ground.is_active)) return "grounds";
  if (staff.length === 0) return "staff";
  return null;
}

function ReviewPanel({
  turf,
  isOwner,
  busy,
  run,
}: {
  turf: OwnerTurf;
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const submittable = turf.status === "draft" || turf.status === "rejected";

  return (
    <Card>
      {/* No status badge here: the turf layout renders one beside the turf's name on
          every page, and two of them on this one is both noise and an ambiguous
          locator. This panel is for the one thing the layout cannot do — submitting. */}
      <CardHeader>
        <CardTitle className="label-sm">{t("review")}</CardTitle>
        <p className="text-muted-foreground mt-1 text-xs">{t("reviewHint")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {turf.rejection_reason && (
          <p className="text-destructive text-xs">{turf.rejection_reason}</p>
        )}
        {submittable && isOwner && (
          <Button
            size="sm"
            className="self-start"
            disabled={busy === "submit"}
            onClick={() =>
              run("submit", () =>
                api.POST("/api/v1/me/turfs/{slug}/submit", {
                  params: { path: { slug: turf.slug } },
                }),
              )
            }
          >
            {t("submit")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Where the turf is — and until now, the one thing registration asked for that could
 * never be corrected afterwards. An owner who dropped the pin on the wrong side of the
 * road had to ask support.
 *
 * Two ways to set it, because an owner knows their venue's Google Maps link and does not
 * know its latitude:
 *
 * * **paste the link** they get from Google Maps' Share button — including the
 *   `maps.app.goo.gl/…` short form, which the backend expands (`apps.turfs.maps`);
 * * **drag the pin**, which wins if they do both, since a drag is the more deliberate act.
 *
 * The pin moves locally as they drag and is only sent on Save, so a mis-drag costs
 * nothing. `directions_url` is shown as a link rather than described, because the only
 * way to be sure a pin is right is to open the route and recognise the place.
 */
function LocationPanel({
  turf,
  isOwner,
  busy,
  run,
  open,
}: {
  turf: OwnerTurf;
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
  open: boolean;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const [link, setLink] = useState("");
  // `null` means "not moved since the page loaded", which is what lets Save send the
  // link alone and leave the pin to the backend.
  const [pin, setPin] = useState<[number, number] | null>(null);

  const centre: [number, number] = pin ?? [turf.latitude ?? 23.8103, turf.longitude ?? 90.4125];
  const placed = turf.latitude != null && turf.longitude != null;
  const dirty = pin !== null || link.trim().length > 0;

  return (
    <Disclosure
      title={t("location")}
      hint={t("locationHint")}
      defaultOpen={open}
      summary={
        placed
          ? t("locationSummary", {
              latitude: (turf.latitude ?? 0).toFixed(4),
              longitude: (turf.longitude ?? 0).toFixed(4),
            })
          : t("locationUnset")
      }
    >
      <>
        <TurfMap
          draggableMarker={isOwner}
          center={centre}
          zoom={16}
          markers={[{ id: "pin", latitude: centre[0], longitude: centre[1], label: turf.name }]}
          onMove={(latitude, longitude) => setPin([latitude, longitude])}
          className="h-72 w-full rounded-xl border"
        />

        {turf.directions_url && (
          <a
            href={turf.directions_url}
            target="_blank"
            rel="noreferrer"
            className="text-brand self-start text-xs font-medium underline"
          >
            {t("checkOnMaps")}
          </a>
        )}

        {isOwner && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="map-link">{t("mapLink")}</Label>
              <Input
                id="map-link"
                inputMode="url"
                value={link}
                placeholder={t("mapLinkPlaceholder")}
                onChange={(event) => setLink(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t("mapLinkHint")}</p>
            </div>

            <Button
              size="sm"
              className="self-start"
              disabled={!dirty || busy === "location"}
              onClick={async () => {
                const ok = await run("location", () =>
                  api.PATCH("/api/v1/me/turfs/{slug}", {
                    params: { path: { slug: turf.slug } },
                    body: {
                      ...(pin ? { latitude: pin[0], longitude: pin[1] } : {}),
                      ...(link.trim() ? { map_url: link.trim() } : {}),
                    } as never,
                  }),
                );
                if (ok) {
                  setLink("");
                  setPin(null);
                }
              }}
            >
              {t("saveLocation")}
            </Button>
          </>
        )}
      </>
    </Disclosure>
  );
}

function GroundsPanel({
  turf,
  sports,
  isOwner,
  busy,
  run,
  open,
}: {
  turf: OwnerTurf;
  sports: Sport[];
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
  open: boolean;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("10");
  const [slotMinutes, setSlotMinutes] = useState("60");
  const [formatIds, setFormatIds] = useState<string[]>([]);

  const formats: Array<SportFormat & { sportName: string; icon: string }> = sports.flatMap(
    (sport) =>
      sport.formats.map((format) => ({
        ...format,
        sportName: sport.name,
        icon: sport.icon ?? "",
      })),
  );

  const active = turf.grounds.filter((ground) => ground.is_active).length;

  return (
    <Disclosure
      title={t("grounds")}
      hint={t("groundsHint")}
      defaultOpen={open}
      summary={
        turf.grounds.length === 0
          ? t("noGrounds")
          : t("groundsSummary", { count: turf.grounds.length, active })
      }
    >
      <>
        {turf.grounds.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noGrounds")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {turf.grounds.map((ground) => (
              <GroundRow
                key={ground.id}
                turf={turf}
                ground={ground}
                isOwner={isOwner}
                busy={busy}
                run={run}
              />
            ))}
          </ul>
        )}

        {isOwner && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-xs font-semibold tracking-wide uppercase">{t("addGround")}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ground-name">{t("groundName")}</Label>
                <Input
                  id="ground-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ground-max">{t("maxPlayers")}</Label>
                <Input
                  id="ground-max"
                  type="number"
                  min={2}
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ground-slot">{t("slotMinutes")}</Label>
                <select
                  id="ground-slot"
                  value={slotMinutes}
                  onChange={(event) => setSlotMinutes(event.target.value)}
                  className="field-select border-input bg-background h-9 rounded-lg border px-2.5 text-sm"
                >
                  {[60, 90, 120].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t("sportFormats")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {formats.map((format) => {
                  const selected = formatIds.includes(format.id);
                  return (
                    <Button
                      key={format.id}
                      type="button"
                      size="xs"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() =>
                        setFormatIds((current) =>
                          selected
                            ? current.filter((id) => id !== format.id)
                            : [...current, format.id],
                        )
                      }
                    >
                      <span aria-hidden className="mr-1">
                        {format.icon}
                      </span>
                      {format.sportName} {format.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Button
              size="sm"
              className="self-start"
              disabled={!name.trim() || formatIds.length === 0 || busy === "add-ground"}
              onClick={async () => {
                const ok = await run("add-ground", () =>
                  api.POST("/api/v1/me/turfs/{slug}/grounds", {
                    params: { path: { slug: turf.slug } },
                    body: {
                      name,
                      max_players: Number(maxPlayers),
                      slot_minutes: Number(slotMinutes),
                      sport_format_ids: formatIds,
                    } as never,
                  }),
                );
                if (ok) {
                  setName("");
                  setFormatIds([]);
                }
              }}
            >
              {t("addGround")}
            </Button>
          </div>
        )}
      </>
    </Disclosure>
  );
}

function GroundRow({
  turf,
  ground,
  isOwner,
  busy,
  run,
}: {
  turf: OwnerTurf;
  ground: Ground;
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("18:00");
  const [price, setPrice] = useState("1500");
  const [label, setLabel] = useState("");

  return (
    <li className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ground.name}</p>
          <p className="text-muted-foreground text-xs">
            {ground.sports.map((sport) => sport.name).join(" · ")} ·{" "}
            {t("slotLength", { minutes: ground.slot_minutes })} ·{" "}
            {t("capacity", { count: ground.max_players })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={ground.is_active ? "default" : "secondary"}>
            {ground.is_active ? t("active") : t("inactive")}
          </Badge>
          {isOwner && (
            <>
              <Button size="xs" variant="ghost" onClick={() => setOpen((value) => !value)}>
                {t("prices", { count: ground.price_rules.length })}
              </Button>
              <Button
                size="xs"
                variant={ground.is_active ? "outline" : "default"}
                disabled={busy === ground.id}
                onClick={() =>
                  run(ground.id, () =>
                    api.POST(
                      ground.is_active
                        ? "/api/v1/me/turfs/{slug}/grounds/{id}/deactivate"
                        : "/api/v1/me/turfs/{slug}/grounds/{id}/activate",
                      { params: { path: { slug: turf.slug, id: ground.id } } },
                    ),
                  )
                }
              >
                {ground.is_active ? t("deactivate") : t("activate")}
              </Button>
            </>
          )}
        </div>
      </div>

      {open && isOwner && (
        <div className="flex flex-col gap-3 border-t p-3">
          {ground.price_rules.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs">
              {ground.price_rules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-2">
                  <span>
                    {/* Optional on write (the model defaults to []), always present on read. */}
                    {(rule.weekdays ?? []).length === 0
                      ? t("everyDay")
                      : (rule.weekdays ?? [])
                          .map((day) => t(`weekdayShort.${day}`))
                          .join(", ")}{" "}
                    {rule.start_time.slice(0, 5)}–{rule.end_time.slice(0, 5)}{" "}
                    {rule.label && `(${rule.label})`}
                  </span>
                  <span className="flex items-center gap-2">
                    <Money amount={rule.price} />
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy === rule.id}
                      onClick={() =>
                        run(rule.id, () =>
                          api.DELETE("/api/v1/me/turfs/{slug}/grounds/{ground_pk}/prices/{id}", {
                            params: {
                              path: { slug: turf.slug, ground_pk: ground.id, id: rule.id },
                            },
                          }),
                        )
                      }
                    >
                      {t("remove")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("weekdays")}</Label>
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => {
                  const selected = weekdays.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="xs"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() =>
                        setWeekdays((current) =>
                          selected ? current.filter((d) => d !== day) : [...current, day],
                        )
                      }
                    >
                      {t(`weekdayShort.${day}`)}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`from-${ground.id}`} className="text-xs">
                {t("from")}
              </Label>
              <Input
                id={`from-${ground.id}`}
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`until-${ground.id}`} className="text-xs">
                {t("until")}
              </Label>
              <Input
                id={`until-${ground.id}`}
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`price-${ground.id}`} className="text-xs">
                {t("price")}
              </Label>
              <Input
                id={`price-${ground.id}`}
                type="number"
                min={0}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`label-${ground.id}`} className="text-xs">
                {t("label")}
              </Label>
              <Input
                id={`label-${ground.id}`}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("labelPlaceholder")}
                className="w-28"
              />
            </div>
            <Button
              size="sm"
              disabled={busy === `price-${ground.id}`}
              onClick={async () => {
                const ok = await run(`price-${ground.id}`, () =>
                  api.POST("/api/v1/me/turfs/{slug}/grounds/{ground_pk}/prices", {
                    params: { path: { slug: turf.slug, ground_pk: ground.id } },
                    body: {
                      weekdays,
                      start_time: startTime,
                      end_time: endTime,
                      price,
                      label,
                    } as never,
                  }),
                );
                if (ok) setLabel("");
              }}
            >
              {t("addPrice")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("priceHint")}</p>

          <MatchTermsPanel turf={turf} ground={ground} busy={busy} run={run} />
        </div>
      )}
    </li>
  );
}

/**
 * How this ground sells each of its per-match formats (DECISIONS D102).
 *
 * Only cricket and badminton reach this panel: an hourly format has nothing to set
 * here, and showing an empty box for the five-a-side pitch would be noise. The figures
 * shown are the **effective** ones — the catalogue's until this ground overrides them —
 * so the owner edits what players currently see rather than a blank form.
 */
function MatchTermsPanel({
  turf,
  ground,
  busy,
  run,
}: {
  turf: OwnerTurf;
  ground: Ground;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
}) {
  const t = useTranslations("ownerManage");
  const perMatch = ground.sport_formats.filter((format) => isPerMatch(format));

  if (perMatch.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <Label className="text-xs">{t("matchTerms")}</Label>
      <p className="text-muted-foreground text-xs">{t("matchTermsHint")}</p>
      <ul className="flex flex-col gap-2">
        {perMatch.map((format) => (
          <MatchTermsRow
            key={format.id}
            turf={turf}
            ground={ground}
            format={format}
            busy={busy}
            run={run}
          />
        ))}
      </ul>
    </div>
  );
}

function MatchTermsRow({
  turf,
  ground,
  format,
  busy,
  run,
}: {
  turf: OwnerTurf;
  ground: Ground;
  format: GroundSportFormat;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
}) {
  const t = useTranslations("ownerManage");
  const c = useTranslations("common");
  const api = useApiClient();

  // The override row, if this ground has one. Its absence is what makes the difference
  // between a POST and a PATCH, and what the "use the default" button removes.
  const existing = ground.format_settings.find((setting) => setting.sport_format_id === format.id);
  const [count, setCount] = useState(String(format.match_unit_count ?? ""));
  const [minutes, setMinutes] = useState(String(format.minutes));
  const [price, setPrice] = useState(format.match_price ?? "");

  const key = `match-${ground.id}-${format.id}`;
  const unit = matchUnitLabel(format);
  const approx = approxDuration(format.minutes);

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
      <div className="min-w-32 flex-1">
        <p className="text-sm font-medium">{format.name}</p>
        <p className="text-muted-foreground text-xs">
          {unit && c(unit.key, unit.values)}
          {approx && ` · ${c(approx.key, approx.values)}`}
          {` · ${existing ? t("matchCustom") : t("matchDefault")}`}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${key}-count`} className="text-xs">
          {t("matchCount")}
        </Label>
        <Input
          id={`${key}-count`}
          type="number"
          min={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className="w-20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${key}-minutes`} className="text-xs">
          {t("matchMinutes")}
        </Label>
        <Input
          id={`${key}-minutes`}
          type="number"
          min={15}
          max={480}
          step={5}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="w-20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${key}-price`} className="text-xs">
          {t("matchPrice")}
        </Label>
        <Input
          id={`${key}-price`}
          type="number"
          min={0}
          value={price}
          placeholder={t("matchPricePlaceholder")}
          onChange={(event) => setPrice(event.target.value)}
          className="w-28"
        />
      </div>
      <Button
        size="sm"
        disabled={busy === key || !count || !minutes}
        onClick={() => {
          const body = {
            sport_format_id: format.id,
            match_unit_count: Number(count),
            approx_minutes: Number(minutes),
            // Blank means "price it from the hourly rate", which is a null, not a 0.
            match_price: price === "" ? null : price,
          };
          return run(key, () =>
            existing
              ? api.PATCH("/api/v1/me/turfs/{slug}/grounds/{ground_pk}/match-settings/{id}", {
                  params: {
                    path: { slug: turf.slug, ground_pk: ground.id, id: existing.id },
                  },
                  body: body as never,
                })
              : api.POST("/api/v1/me/turfs/{slug}/grounds/{ground_pk}/match-settings", {
                  params: { path: { slug: turf.slug, ground_pk: ground.id } },
                  body: body as never,
                }),
          );
        }}
      >
        {t("matchSave")}
      </Button>
      {existing && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy === key}
          onClick={() =>
            run(key, () =>
              api.DELETE("/api/v1/me/turfs/{slug}/grounds/{ground_pk}/match-settings/{id}", {
                params: { path: { slug: turf.slug, ground_pk: ground.id, id: existing.id } },
              }),
            )
          }
        >
          {t("matchReset")}
        </Button>
      )}
    </li>
  );
}

function HoursPanel({
  turf,
  isOwner,
  busy,
  run,
  open,
}: {
  turf: OwnerTurf;
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
  open: boolean;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const [openTime, setOpenTime] = useState("06:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [days, setDays] = useState<number[]>([...WEEKDAYS]);

  const byDay = new Map<number, OperatingHours[]>();
  for (const row of turf.operating_hours) {
    byDay.set(row.weekday, [...(byDay.get(row.weekday) ?? []), row]);
  }

  return (
    <Disclosure
      title={t("hours")}
      hint={t("hoursHint")}
      defaultOpen={open}
      summary={byDay.size === 0 ? t("hoursUnset") : t("hoursSummary", { count: byDay.size })}
    >
      <>
        <ul className="flex flex-col gap-1 text-sm">
          {WEEKDAYS.map((day) => {
            const rows = byDay.get(day) ?? [];
            return (
              <li key={day} className="flex items-center justify-between gap-2 py-1">
                <span className="w-24 shrink-0 text-xs font-medium">{t(`weekday.${day}`)}</span>
                {rows.length === 0 ? (
                  <span className="text-muted-foreground flex-1 text-xs">{t("closed")}</span>
                ) : (
                  <span className="flex flex-1 flex-wrap gap-2">
                    {rows.map((row) => (
                      <span key={row.id} className="flex items-center gap-1 text-xs">
                        <span className="num">
                          {row.open_time.slice(0, 5)}–{row.close_time.slice(0, 5)}
                        </span>
                        {row.crosses_midnight && (
                          <span className="text-muted-foreground">{t("nextDay")}</span>
                        )}
                        {isOwner && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy === row.id}
                            onClick={() =>
                              run(row.id, () =>
                                api.DELETE("/api/v1/me/turfs/{slug}/hours/{id}", {
                                  params: { path: { slug: turf.slug, id: row.id } },
                                }),
                              )
                            }
                          >
                            ×
                          </Button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("weekdays")}</Label>
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => {
                  const selected = days.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="xs"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() =>
                        setDays((current) =>
                          selected ? current.filter((d) => d !== day) : [...current, day],
                        )
                      }
                    >
                      {t(`weekdayShort.${day}`)}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="opens" className="text-xs">
                {t("opens")}
              </Label>
              <Input
                id="opens"
                type="time"
                value={openTime}
                onChange={(event) => setOpenTime(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="closes" className="text-xs">
                {t("closes")}
              </Label>
              <Input
                id="closes"
                type="time"
                value={closeTime}
                onChange={(event) => setCloseTime(event.target.value)}
                className="w-28"
              />
            </div>
            <Button
              size="sm"
              disabled={days.length === 0 || busy === "hours"}
              onClick={() =>
                run("hours", async () => {
                  // One request per selected day; the API models a row per weekday.
                  for (const day of days) {
                    const result = await api.POST("/api/v1/me/turfs/{slug}/hours", {
                      params: { path: { slug: turf.slug } },
                      body: {
                        weekday: day,
                        open_time: openTime,
                        close_time: closeTime,
                      } as never,
                    });
                    if (result.error) return result;
                  }
                  return {};
                })
              }
            >
              {t("setHours")}
            </Button>
          </div>
        )}
      </>
    </Disclosure>
  );
}

function StaffPanel({
  turf,
  staff,
  isOwner,
  busy,
  run,
  open,
}: {
  turf: OwnerTurf;
  staff: TurfMembership[];
  isOwner: boolean;
  busy: Busy;
  run: (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;
  open: boolean;
}) {
  const t = useTranslations("ownerManage");
  const api = useApiClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");

  return (
    <Disclosure
      title={t("staff")}
      hint={t("staffHint")}
      defaultOpen={open}
      summary={staff.length === 0 ? t("staffNone") : t("staffSummary", { count: staff.length })}
    >
      <>
        <ul className="flex flex-col gap-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {member.user_name || member.user_email || member.invited_email}
                </span>
                <span className="text-muted-foreground text-xs">
                  {member.role_label} ·{" "}
                  {member.status === "active" ? t("staffActive") : t("staffInvited")}
                </span>
              </span>
              {isOwner && member.role !== "owner" && (
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy === member.id}
                  onClick={() =>
                    run(member.id, () =>
                      api.DELETE("/api/v1/me/turfs/{slug}/staff/{membership_id}", {
                        params: { path: { slug: turf.slug, membership_id: member.id } },
                      }),
                    )
                  }
                >
                  {t("remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="staff-email" className="text-xs">
                {t("staffEmail")}
              </Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="staff-role" className="text-xs">
                {t("staffRole")}
              </Label>
              <select
                id="staff-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="field-select border-input bg-background h-9 rounded-lg border px-2.5 text-sm"
              >
                <option value="cashier">{t("roleCashier")}</option>
                <option value="manager">{t("roleManager")}</option>
              </select>
            </div>
            <Button
              size="sm"
              disabled={!email.trim() || busy === "invite"}
              onClick={async () => {
                const ok = await run("invite", () =>
                  api.POST("/api/v1/me/turfs/{slug}/staff/invite", {
                    params: { path: { slug: turf.slug } },
                    body: { role, email } as never,
                  }),
                );
                if (ok) setEmail("");
              }}
            >
              {t("invite")}
            </Button>
          </div>
        )}
      </>
    </Disclosure>
  );
}
