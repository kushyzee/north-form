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

/** Human label for a stock level. Never phrased as urgency copy. */
export function formatStockLabel(stockQuantity: number): string {
  if (stockQuantity <= 0) return "Out of stock"
  return `${stockQuantity} in stock`
}

/** "1 item" / "4 items", used for the cart badge and summaries. */
export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`
}