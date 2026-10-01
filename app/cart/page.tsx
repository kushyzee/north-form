import type { Metadata } from "next"

import { CartView } from "@/components/cart/cart-view"

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review the pieces in your bag before checking out.",
}

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="mb-10">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          Your cart
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Prices are shown in Nigerian Naira. Stock and totals are re-checked
          before your order is placed.
        </p>
      </header>

      {/* Client Component: the cart lives in browser storage. */}
      <CartView />
    </div>
  )
}