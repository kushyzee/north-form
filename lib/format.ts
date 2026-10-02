/**
 * Presentation helpers for the storefront.
 *
 * Nigerian Naira is formatted with the `en-NG` locale and `NGN` currency, which
 * renders as `₦28,000` — whole naira, no decimal noise.
 */

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatNaira(amount: number): string {
  return nairaFormatter.format(amount)
}

/** "1 item" / "4 items", used for the cart badge and summaries. */
export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`
}