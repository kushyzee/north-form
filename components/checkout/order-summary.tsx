import type { CartItem } from "@/components/cart/cart-provider"
import type { DeliveryRegion } from "@/lib/checkout/delivery"
import { getCartCount } from "@/lib/cart/reducer"
import { formatItemCount, formatNaira } from "@/lib/format"

/**
 * Checkout order summary.
 *
 * **Display only.** The unit prices come from the cart's add-time snapshot and
 * the delivery fee from `getDeliveryFee`, so both are what the customer expects
 * to pay rather than what they will be charged. Phase 5B recomputes everything
 * from the catalogue on the server, which is why the totals carry a note saying
 * so. Nothing here is a source of truth, and nothing here should ever be
 * submitted.
 *
 * Presentational: the cart and the chosen state are passed in by the form so
 * this component holds no state of its own.
 */

type OrderSummaryProps = {
  items: CartItem[]
  subtotal: number
  /** `null` until a state is chosen — the fee is unknown, not zero. */
  deliveryFee: number | null
  /** Which shipping band the chosen state falls into, for context. */
  deliveryRegion: DeliveryRegion | null
}

export function OrderSummary({
  items,
  subtotal,
  deliveryFee,
  deliveryRegion,
}: OrderSummaryProps) {
  return (
    <aside
      aria-label="Order summary"
      className="h-fit rounded-lg border border-border bg-card p-6 lg:sticky lg:top-24"
    >
      <h2 className="font-heading text-lg">Order summary</h2>

      <ul className="mt-5 divide-y divide-border border-b border-border">
        {items.map((item) => (
          <li key={item.lineId} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.productName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.size ? `Size ${item.size} · ` : ""}
                {item.quantity} × {formatNaira(item.unitPrice)}
              </p>
            </div>
            <p className="shrink-0 text-sm whitespace-nowrap tabular-nums">
              {formatNaira(item.unitPrice * item.quantity)}
            </p>
          </li>
        ))}
      </ul>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="tabular-nums">{formatItemCount(getCartCount(items))}</dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-medium tabular-nums">{formatNaira(subtotal)}</dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="text-right tabular-nums">
            {deliveryFee === null ? (
              <span className="text-muted-foreground">Select a state</span>
            ) : (
              <>
                {formatNaira(deliveryFee)}
                {deliveryRegion ? (
                  <span className="block text-xs text-muted-foreground">
                    {deliveryRegion}
                  </span>
                ) : null}
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="font-medium">Total</span>
        <span className="font-heading text-lg tabular-nums">
          {formatNaira(subtotal + (deliveryFee ?? 0))}
        </span>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        For review only. Prices, delivery and stock are re-checked on our
        servers when your order is placed.
      </p>
    </aside>
  )
}