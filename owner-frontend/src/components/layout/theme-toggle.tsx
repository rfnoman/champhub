"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Monitor, MoonStar, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: MoonStar },
] as const;

/**
 * "Has this hydrated yet", without a `setState` in an effect.
 *
 * `useSyncExternalStore` with a no-op subscription returns the server snapshot on the
 * server and the client snapshot on the client, which is exactly the question being
 * asked — and unlike the `useEffect(() => setMounted(true))` idiom it does not schedule
 * a second render pass.
 */
const NEVER_CHANGES = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

/**
 * Light / dark / follow-the-phone (DECISIONS D77).
 *
 * Three states rather than a two-way switch, because "system" is the default and has to
 * be reachable again once someone has overridden it — a toggle that only flips between
 * light and dark silently strips a preference people cannot get back.
 *
 * The icon is resolved from `theme` (what was chosen) rather than `resolvedTheme` (what
 * is showing), so the control reports the choice: on "system" it shows the monitor, not
 * whichever of light or dark the phone happens to be in.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  // `theme` is undefined until next-themes has read storage on the client, so rendering
  // it directly would make the first pass disagree with the second.
  const ready = useHydrated();

  const active = ready ? (theme ?? "system") : "system";
  const ActiveIcon = OPTIONS.find((option) => option.value === active)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("label")}>
          <ActiveIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            disabled={ready && value === active}
          >
            <Icon className="size-4" aria-hidden />
            {t(value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
