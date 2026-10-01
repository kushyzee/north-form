"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShoppingBag } from "lucide-react"

import { useCart } from "@/components/cart/cart-provider"
import { CheckoutForm } from "@/components/checkout/checkout-form"
import { EmptyState } from "@/components/storefront/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import type { CheckoutProfileDefaults } from "@/lib/checkout/profile"

/**
 * Checkout body.
 *
 * A Client Component because the cart lives in browser storage, so whether there
 * is anything to check out is only knowable in the browser. Until the persisted
 * cart has been read it renders a skeleton, which keeps the server-rendered
 * markup and the first client render in agreement — the same approach
 * `components/cart/cart-view.tsx` takes.
 *
 * An empty cart never reaches the form at all, so there is nothing to submit
 * and no "place order" button to submit it with.
 *
 * After a successful order the cart is emptied and the customer is sent to the
 * confirmation page. `placed` exists purely for that hand-off: clearing the cart
 * would otherwise flip this component to its empty-cart branch for the few
 * hundred milliseconds the redirect takes, showing "nothing to check out" right
 * after an order was placed. Rendering the skeleton keeps the transition quiet.
 */

/** Placeholder matching the real form's two-column shape. */
function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
      <div className="space-y-8">
        {[0, 1].map((section) => (
          <div key={section} className="space-y-4">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-11 w-full" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  )
}

export function CheckoutView({
  profile,
}: {
  profile: CheckoutProfileDefaults | null
}) {
  const { items, hydrated, clearCart } = useCart()
  const router = useRouter()
  const [placed, setPlaced] = useState(false)

  // Checked before the empty-cart branch, so clearing the cart below does not
  // flash the empty state during the redirect.
  if (placed) return <CheckoutSkeleton />

  if (!hydrated) return <CheckoutSkeleton />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag aria-hidden="true" className="size-7" />}
        title="There is nothing to check out yet"
        description="Your bag is empty. Add a piece from the shop and come back — your bag is kept in this browser."
        action={{ href: "/shop", label: "Browse the shop" }}
      />
    )
  }

  return (
    <CheckoutForm
      profile={profile}
      onOrderPlaced={(orderNumber) => {
        // The order now lives in the database, so the browser's copy of that
        // intent is spent and can go. The confirmation page re-reads the order
        // from the database rather than trusting anything from this form.
        clearCart()
        setPlaced(true)
        router.replace(`/checkout/confirmation/${encodeURIComponent(orderNumber)}`)
      }}
    />
  )
}