/**
 * Cart line model.
 *
 * IMPORTANT: this is a **client-side UX snapshot only**. It is not
 * authoritative order data. `unitPrice` and `maxQuantity` are captured when the
 * item is added so the UI can render sensibly, but checkout must re-read
 * products, prices and stock from Supabase on a trusted server-side path and
 * compute totals itself. Never trust these values during order creation.
 */

export type CartItem = {
  /** Composite line key: `${productId}::${size}`. Stable and unique per line. */
  lineId: string
  productId: string
  productSlug: string
  productName: string
  productImage: string | null
  categoryName: string
  /** Naira. Snapshot of `products.price` at the time of adding. */
  unitPrice: number
  /** Selected size. Products without sizes use `null`. */
  size: string | null
  quantity: number
  /** Stock known when added/updated — caps this line's quantity. */
  maxQuantity: number
}

export type CartState = {
  items: CartItem[]
  /** False until the persisted cart has been read, to avoid hydration mismatch. */
  hydrated: boolean
}

export const initialCartState: CartState = {
  items: [],
  hydrated: false,
}

export type CartAction =
  | { type: "hydrate"; items: CartItem[] }
  | {
      type: "add"
      item: Omit<CartItem, "lineId" | "quantity">
      quantity: number
    }
  | { type: "setQuantity"; lineId: string; quantity: number }
  | { type: "increment"; lineId: string }
  | { type: "decrement"; lineId: string }
  | { type: "remove"; lineId: string }
  | { type: "clear" }

/** Builds the composite key that makes a product+size pair a distinct line. */
export function toLineId(productId: string, size: string | null): string {
  return `${productId}::${size ?? ""}`
}

/**
 * Keeps a requested quantity within `[1, maxQuantity]`.
 *
 * Note the `Math.floor(quantity)` guard: `NaN`, `Infinity` and `undefined` all
 * fall through to 1. A requested 0 or negative is *not* clamped up to 1 here —
 * callers that treat "0" as "remove this line" rely on seeing it as 0.
 */
export function clampQuantity(quantity: number, maxQuantity: number): number {
  if (maxQuantity <= 0) return 0
  const floored = Math.floor(quantity)
  if (!Number.isFinite(floored) || floored < 1) return 1
  return Math.min(floored, maxQuantity)
}

/**
 * Applies a derived quantity to one line, removing it when the result drops to
 * zero or below. Shared by `setQuantity`, `increment` and `decrement`.
 */
function updateQuantity(
  state: CartState,
  lineId: string,
  next: (current: number) => number,
): CartState {
  const target = state.items.find((entry) => entry.lineId === lineId)
  if (!target) return state

  const requested = next(target.quantity)

  // Ignore a non-numeric request entirely — this happens when a user clears the
  // quantity input, and must not delete the line.
  if (!Number.isFinite(requested)) return state

  // Explicitly remove on zero/negative before clamping, so decrementing past 1
  // drops the line instead of silently sticking at 1.
  if (requested < 1) {
    return { ...state, items: state.items.filter((entry) => entry.lineId !== lineId) }
  }

  const quantity = clampQuantity(requested, target.maxQuantity)

  return {
    ...state,
    items: state.items.map((entry) =>
      entry.lineId === lineId ? { ...entry, quantity } : entry,
    ),
  }
}

/**
 * Pure cart reducer. Kept free of React so the rules stay easy to read and
 * test: same product + same size merges, different sizes stay separate, and no
 * line can exceed the stock known when it was added.
 */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { items: action.items, hydrated: true }

    case "add": {
      const { item, quantity } = action
      const lineId = toLineId(item.productId, item.size)
      const maxQuantity = Math.max(item.maxQuantity, 0)

      // Out of stock — refuse the add rather than storing an unbuyable line.
      if (maxQuantity <= 0) return state

      const existing = state.items.find((entry) => entry.lineId === lineId)

      if (existing) {
        // Same product and same size: merge into the existing line rather than
        // creating a duplicate. Clamp against the freshest stock figure.
        return {
          ...state,
          items: state.items.map((entry) =>
            entry.lineId === lineId
              ? {
                  ...entry,
                  quantity: clampQuantity(entry.quantity + quantity, maxQuantity),
                  maxQuantity,
                }
              : entry,
          ),
        }
      }

      return {
        ...state,
        items: [
          ...state.items,
          {
            ...item,
            lineId,
            quantity: clampQuantity(quantity, maxQuantity),
          },
        ],
      }
    }

    case "setQuantity":
      // Setting to zero (or below) removes the line.
      return updateQuantity(state, action.lineId, () => action.quantity)

    case "increment":
      return updateQuantity(state, action.lineId, (current) => current + 1)

    case "decrement":
      // Decreasing from 1 removes the line rather than parking it at zero.
      return updateQuantity(state, action.lineId, (current) => current - 1)

    case "remove": {
      const items = state.items.filter((entry) => entry.lineId !== action.lineId)
      // Return the same reference when nothing changed, so consumers relying on
      // identity (memoisation) are not invalidated by a no-op.
      return items.length === state.items.length ? state : { ...state, items }
    }

    case "clear":
      return state.items.length === 0 ? state : { ...state, items: [] }

    default:
      return state
  }
}

/** Total units across all lines — drives the header badge. */
export function getCartCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}

/** Sum of `unitPrice × quantity` across all lines. */
export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
}