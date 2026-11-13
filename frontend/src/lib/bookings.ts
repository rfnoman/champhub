import type { Booking } from "@/lib/api/types";

/**
 * Whether a booking is still in a state a player can cancel from.
 *
 * In a plain module rather than beside the component that uses it: the booking page is
 * a Server Component and `booking-actions.tsx` is `"use client"`, and a function
 * exported from a client module cannot be *called* from the server — only rendered as a
 * component or passed as a prop. Doing that throws at request time ("Attempted to call
 * canCancel() from the server"), which lint, typecheck and `next build` all pass.
 *
 * The API decides what is actually allowed; this only decides what is rendered.
 */
export function canCancel(booking: Booking): boolean {
  return ["reserved", "confirmed", "paid"].includes(booking.status);
}
