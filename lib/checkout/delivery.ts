/**
 * Delivery fee calculation for the demo storefront.
 *
 * IMPORTANT: this is a **display-only** helper in Phase 5A. The number produced
 * here is what the order summary renders while the customer fills the form.
 * Phase 5B must recompute the fee on the trusted server-side order-creation
 * path from the validated `state` — never accept a fee (or a total that embeds
 * one) from the browser.
 *
 * The rates are the fictional demo fees recorded in AGENTS.md. Two canonical
 * states map onto a named delivery region rather than a fee of their own:
 * `Federal Capital Territory` ships as Abuja and `Rivers` as Port Harcourt.
 */

/** Named shipping band a destination falls into. */
export type DeliveryRegion = "Lagos" | "Abuja" | "Port Harcourt" | "Other states"

/**
 * Fictional demo rates in naira. See AGENTS.md → "Delivery fees".
 * Keyed by region so the state → region → fee chain has one definition.
 */
export const DELIVERY_FEES: Record<DeliveryRegion, number> = {
  Lagos: 2000,
  Abuja: 2500,
  "Port Harcourt": 3000,
  "Other states": 4000,
}

/**
 * Maps a canonical state onto its delivery region.
 *
 * A `switch` rather than a lookup object: the input is user-controlled, and
 * indexing a plain object with an arbitrary string would happily return
 * something inherited from `Object.prototype`.
 */
export function getDeliveryRegion(state: string | null | undefined): DeliveryRegion {
  switch (state) {
    case "Lagos":
      return "Lagos"
    case "Federal Capital Territory":
      return "Abuja"
    case "Rivers":
      return "Port Harcourt"
    default:
      return "Other states"
  }
}

/**
 * The delivery fee in naira for a destination.
 *
 * Deliberately total: an unselected or unrecognised state falls back to the
 * "Other states" rate rather than throwing, so the summary always renders a
 * number. An unknown state is a validation problem, not a crash.
 */
export function getDeliveryFee(state: string | null | undefined): number {
  return DELIVERY_FEES[getDeliveryRegion(state)]
}