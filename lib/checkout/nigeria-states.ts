/**
 * Canonical Nigerian delivery destinations.
 *
 * These are the exact display names the checkout `<Select>` offers and the exact
 * strings stored on `orders.delivery_state`, so there is a single source of
 * truth for both. The list is the 36 states plus the Federal Capital Territory,
 * in alphabetical order with the FCT last.
 *
 * Mirrors how `lib/catalogue/types.ts` treats `PRODUCT_SORTS`: a `const` tuple
 * plus a type plus a narrowing guard, rather than free text typed by the user.
 */

export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "Federal Capital Territory",
] as const

/** One of the destinations the checkout form accepts. */
export type NigerianState = (typeof NIGERIAN_STATES)[number]

/** Shown on the unselected state control. */
export const STATE_PLACEHOLDER = "Select a state"

/** Narrowing guard: rejects anything outside the canonical list. */
export function isNigerianState(value: unknown): value is NigerianState {
  return (
    typeof value === "string" &&
    (NIGERIAN_STATES as readonly string[]).includes(value)
  )
}