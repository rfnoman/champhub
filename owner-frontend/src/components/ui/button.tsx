import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

/**
 * Press physics live in the `press` utility and the `active:not-aria-[haspopup]:*`
 * modifiers below (DECISIONS D79), not in Framer Motion.
 *
 * This component is used 62 times across 23 server files and 39 client ones and has no
 * `"use client"`. Giving it a `whileTap` spring would turn those 23 server call sites
 * into client islands to buy a 150ms animation — so the spring is CSS instead. It is a
 * real spring, not an approximation: `--ease-spring-out` is a `linear()` polyline
 * sampled from a solver. `:active` only applies while the button is held, so the
 * *release* is what reads as spring-back, and the asymmetry is deliberate — 90ms in on a
 * fast curve, 420ms out with overshoot.
 *
 * `not-aria-[haspopup]` is inherited from radix-nova and must stay: a dropdown trigger
 * holds `aria-expanded` while its menu is open and must not sit visually pressed.
 */
const buttonVariants = cva(
  "group/button press inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        /* The lit call to action. Carries a glow rather than a drop shadow, because the
           light in this design comes from the pitch, not from above. */
        brand:
          "bg-brand text-brand-foreground hover:bg-brand/90 shadow-[0_0_0_0_transparent] hover:shadow-[0_2px_20px_-4px_var(--brand)]",
        flare: "bg-flare text-flare-foreground hover:bg-flare/90 focus-visible:ring-destructive/30",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        /* radix-nova tops out at `h-9`, which is well under a 44px tap target on a
           phone-first PWA. These are additions rather than changes to the existing
           sizes, which the e2e suite asserts against. */
        touch: "h-11 gap-2 px-4 text-[0.9375rem] [&_svg:not([class*='size-'])]:size-4.5",
        cta: "font-display h-13 gap-2 rounded-xl px-6 text-base font-semibold tracking-tight [&_svg:not([class*='size-'])]:size-5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        "icon-touch": "size-11 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
