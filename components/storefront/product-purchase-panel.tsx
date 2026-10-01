"use client"

import { Minus, Plus, ShoppingBag } from "lucide-react"
import { useState } from "react"

import { useCart } from "@/components/cart/cart-provider"
import { Button } from "@/components/ui/button"
import { getAvailability, type Product } from "@/lib/catalogue/types"
import { clampQuantity } from "@/lib/cart/reducer"
import { cn } from "@/lib/utils"

/**
 * Size / quantity / add-to-bag controls for a product detail page.
 *
 * Rules enforced here:
 *  - a size must be chosen when the product has sizes
 *  - quantity can never exceed `stock_quantity`
 *  - a zero-stock product cannot be added at all
 *
 * These are UX constraints only. The server re-checks stock during checkout.
 */
export function ProductPurchasePanel({ product }: { product: Product }) {
  const { addItem } = useCart()

  const hasSizes = product.sizes.length > 0
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState(false)

  const availability = getAvailability(product.stockQuantity)
  const outOfStock = availability === "out_of_stock"
  const maxQuantity = Math.max(product.stockQuantity, 1)

  function handleAddToBag() {
    if (outOfStock) return

    // Required size not chosen — tell the user instead of silently doing nothing.
    if (hasSizes && !selectedSize) {
      setError("Choose a size to continue.")
      return
    }

    setError(null)
    addItem(
      {
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        productImage: product.images[0] ?? null,
        categoryName: product.category.name,
        unitPrice: product.price,
        size: hasSizes ? selectedSize : null,
        maxQuantity: product.stockQuantity,
      },
      quantity,
    )

    setJustAdded(true)
    // Reset the confirmation so adding again re-announces it.
    window.setTimeout(() => setJustAdded(false), 3000)
  }
return (
    <div className="flex flex-col gap-6">
      {/* Size */}
      {hasSizes ? (
        <fieldset>
          <legend className="text-sm font-medium">
            Size
            <span className="ml-2 font-normal text-muted-foreground">
              {selectedSize ? `Selected: ${selectedSize}` : "Required"}
            </span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.sizes.map((size) => {
              const active = selectedSize === size
              return (
                <label
                  key={size}
                  className={cn(
                    "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm transition-colors",
                    "focus-within:ring-3 focus-within:ring-ring/50",
                    active
                      ? "border-brand-ink bg-brand-ink text-brand-canvas"
                      : "border-border bg-background hover:border-brand-ink/50",
                  )}
                >
                  <input
                    type="radio"
                    name={`size-${product.id}`}
                    value={size}
                    checked={active}
                    onChange={() => {
                      setSelectedSize(size)
                      setError(null)
                    }}
                    className="sr-only"
                  />
                  {size}
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Quantity + Add to bag */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <span id={`quantity-label-${product.id}`} className="text-sm font-medium">
            Quantity
          </span>
          <div className="mt-3 flex h-11 items-center rounded-md border border-border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-none rounded-l-md"
              onClick={() => setQuantity((c) => clampQuantity(c - 1, maxQuantity))}
              disabled={outOfStock || quantity <= 1}
            >
              <Minus aria-hidden="true" />
              <span className="sr-only">Decrease quantity</span>
            </Button>

            <span
              aria-live="polite"
              aria-labelledby={`quantity-label-${product.id}`}
              className="w-12 text-center text-sm tabular-nums"
            >
              {quantity}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-none rounded-r-md"
              onClick={() => setQuantity((c) => clampQuantity(c + 1, maxQuantity))}
              disabled={outOfStock || quantity >= product.stockQuantity}
            >
              <Plus aria-hidden="true" />
              <span className="sr-only">Increase quantity</span>
            </Button>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleAddToBag}
          disabled={outOfStock}
          className="h-12 flex-1 sm:flex-none sm:px-10"
        >
          <ShoppingBag aria-hidden="true" />
          {outOfStock ? "Out of stock" : "Add to bag"}
        </Button>
      </div>

      {/* Stock note. Factual count only — no invented urgency copy. */}
      {!outOfStock ? (
        <p className="text-sm text-muted-foreground">
          {product.stockQuantity} in stock
          {availability === "low_stock" ? " — limited availability" : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          This piece is currently unavailable. Check back soon.
        </p>
      )}

      {/* Form-level messaging, announced to assistive tech. */}
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : justAdded ? (
          <span className="text-brand-olive">
            Added to your bag.{" "}
            <a href="/cart" className="underline underline-offset-4">
              Review your cart
            </a>
          </span>
        ) : null}
      </p>
    </div>
  )
}