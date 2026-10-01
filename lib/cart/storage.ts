import { toLineId, type CartItem } from "@/lib/cart/reducer"

/**
 * `localStorage` persistence for the cart.
 *
 * The browser is untrusted here: stored data may be absent, stale (a shipped
 * version that renamed a field) or hand-edited. Everything read back is
 * validated and dropped rather than trusted.
 */

const STORAGE_KEY = "north-form:cart:v1"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  const floored = Math.floor(parsed)
  return floored > 0 ? floored : null
}

function toStoredItem(value: unknown): CartItem | null {
  if (!isRecord(value)) return null

  const productId = asString(value.productId)
  const productSlug = asString(value.productSlug)
  const productName = asString(value.productName)
  const unitPrice = typeof value.unitPrice === "number" ? value.unitPrice : Number(value.unitPrice)
  const quantity = asPositiveInt(value.quantity)
  const maxQuantity = asPositiveInt(value.maxQuantity)

  if (!productId || !productSlug || !productName || quantity === null || maxQuantity === null) {
    return null
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null

  const size = typeof value.size === "string" && value.size.length > 0 ? value.size : null
  const categoryName = typeof value.categoryName === "string" ? value.categoryName : ""
  const productImage = typeof value.productImage === "string" ? value.productImage : null

  return {
    // Recomputed rather than read, so the key can never drift from its parts.
    lineId: toLineId(productId, size),
    productId,
    productSlug,
    productName,
    productImage,
    categoryName,
    unitPrice,
    size,
    // Never restore more units than the recorded stock ceiling.
    quantity: Math.min(quantity, maxQuantity),
    maxQuantity,
  }
}

/** Reads and validates the persisted cart. Returns `[]` when unusable. */
export function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(toStoredItem)
      .filter((item): item is CartItem => item !== null)
  } catch {
    // Corrupt JSON or storage blocked (private mode, disabled cookies).
    return []
  }
}

/** Persists the cart. Storage failures are non-fatal to the session. */
export function writeStoredCart(items: CartItem[]): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota exceeded or storage unavailable — the in-memory cart still works.
  }
}