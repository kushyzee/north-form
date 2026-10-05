"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  addCartItem as apiAddCartItem,
  clearCart as apiClearCart,
  fetchCart,
  removeCartItem as apiRemoveCartItem,
  setCartItemQuantity as apiSetCartItemQuantity,
  type CartClientError,
  type CartClientResult,
} from "@/lib/cart/cart-client"
import { migrateLocalCart } from "@/lib/cart/migrate"
import {
  cartReducer,
  getCartCount,
  getCartSubtotal,
  initialCartState,
  type CartAction,
  type CartItem,
  type CartState,
} from "@/lib/cart/reducer"
import { readStoredCart, writeStoredCart } from "@/lib/cart/storage"

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  /**
   * False on the server and during the first client render, before the cart has
   * been read. Consumers that would otherwise flash a wrong item count (the
   * header badge) should wait for this. It stays false while a load is in
   * flight, and flips true whether the load succeeded or failed — a failure is
   * an error state, not an empty cart.
   */
  hydrated: boolean
  /** True while a mutation is in flight, so controls can disable themselves. */
  pending: boolean
  /**
   * The last failure, or `null`. A failed write never changes `items`: the cart
   * keeps whatever the server last confirmed, so the UI can never claim a
   * change that did not happen.
   */
  error: CartClientError | null
  /** True when this browser is signed in and the server cart is the authority. */
  isServerCart: boolean
  addItem: (item: Omit<CartItem, "lineId" | "quantity">, quantity?: number) => void
  removeItem: (lineId: string) => void
  setQuantity: (lineId: string, quantity: number) => void
  incrementItem: (lineId: string) => void
  decrementItem: (lineId: string) => void
  clearCart: () => void
  /** Re-reads the cart from its source after a failure the customer can retry. */
  retry: () => void
  dismissError: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/** Splits `lineId` back into the pair the API addresses a line by. */
function parseLineId(lineId: string): { productId: string; size: string } | null {
  const separator = lineId.indexOf("::")
  if (separator <= 0) return null
  return {
    productId: lineId.slice(0, separator),
    size: lineId.slice(separator + 2),
  }
}

/**
 * The one place the web cart lives.
 *
 * Two sources, one shape. Which one is authoritative depends entirely on
 * whether there is a session:
 *
 * - **No session** — `localStorage`, exactly as before. The storefront has
 *   always worked for anonymous visitors and nothing here changes that.
 * - **Session** — the server cart via `/api/cart`. Storage is neither read for
 *   display nor written, so a stale local bag can never contradict the server.
 *
 * `userId` is passed down from the Server Component layout, which reads it from
 * verified claims. Sign-out already calls `router.refresh()`, so the same
 * mechanism that updates the header updates this: a new `userId` re-runs the
 * load, and the previous customer's lines are discarded before the next
 * account's are read.
 */
export function CartProvider({
  userId,
  children,
}: {
  /** `null` for an anonymous visitor. From the server session, never a param. */
  userId: string | null
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<CartClientError | null>(null)

  const isServerCart = userId !== null

  /**
   * Increments on every load and every mutation. A response whose sequence has
   * been superseded is discarded, so a slow request can never overwrite the
   * result of a later one.
   */
  const sequence = useRef(0)
  /** The identity the in-memory cart currently belongs to. */
  const loadedFor = useRef<string | null>(null)

  /**
   * Loads the cart for the current identity.
   *
   * For a signed-in visitor this also migrates any cart left in storage from
   * before sign-in, rather than dropping it. The migration runs through the
   * same API every other write uses, so nothing from storage becomes state
   * without the database re-validating it.
   */
  const load = useCallback(async () => {
    const seq = ++sequence.current

    // ---- Anonymous: storage is the authority. ----
    if (!userId) {
      // `loadedFor` distinguishes "there has never been a session" from "a
      // different customer just signed in", so signing out or switching
      // accounts never leaves the previous cart on screen.
      const hadSession = loadedFor.current !== null
      loadedFor.current = null
      setPending(false)
      setError(null)
      dispatch({ type: "hydrate", items: hadSession ? [] : readStoredCart() })
      return
    }

    // ---- Signed in: the server cart is the authority. ----
    // A different account. Drop the previous cart *before* loading, so a slow
    // or failed load cannot show one customer's lines to another.
    if (loadedFor.current !== userId) {
      loadedFor.current = userId
      dispatch({ type: "hydrate", items: [] })
    }

    setPending(true)
    setError(null)

    const localItems = readStoredCart()

    const read = await fetchCart()
    if (seq !== sequence.current) return

    if (!read.ok) {
      setPending(false)
      setError(read.error)
      // `hydrated` becomes true: this is an error state, not an empty cart.
      dispatch({ type: "hydrate", items: [] })
      return
    }

    if (localItems.length === 0) {
      setPending(false)
      dispatch({ type: "hydrate", items: read.cart.items as unknown as CartItem[] })
      return
    }

    const migration = await migrateLocalCart({
      items: localItems,
      addLine: (line) => apiAddCartItem(line),
    })
    if (seq !== sequence.current) return

    // Storage is cleared only once every line has been dealt with. A transport
    // failure leaves it in place so the migration can run again; the shared
    // migration id makes that retry safe.
    if (migration.complete) writeStoredCart([])

    setPending(false)
    if (!migration.complete) {
      setError({
        code: "NETWORK_ERROR",
        message:
          "We could not move everything from your saved bag. Your account bag is shown here.",
        status: 0,
      })
    }

    // Re-read rather than trusting the pre-migration snapshot: the migration
    // merges into whatever was already on the server, so only the server knows
    // the result.
    const after = await fetchCart()
    if (seq !== sequence.current) return

    if (after.ok) {
      dispatch({ type: "hydrate", items: after.cart.items as unknown as CartItem[] })
    } else {
      dispatch({ type: "hydrate", items: read.cart.items as unknown as CartItem[] })
      setError(after.error)
    }
  }, [userId])

  useEffect(() => {
    // Deferred by a microtask rather than run inline. The anonymous branch
    // reads `localStorage`, which is synchronous, so calling `load()` directly
    // would setState during the effect body and trigger a cascading render —
    // `react-hooks/set-state-in-effect`. Deferring also means the skeleton
    // paints before the cart appears, which is what keeps the server markup
    // and the first client render in agreement.
    void Promise.resolve().then(() => load())
  }, [load])

  // Persist to storage only for the anonymous cart. A signed-in cart belongs to
  // the server, and keeping a second copy here is what created two competing
  // truths in the first place.
  useEffect(() => {
    if (!state.hydrated || userId) return
    writeStoredCart(state.items)
  }, [state.hydrated, state.items, userId])

  /**
   * Runs one mutation and adopts the cart the server returned.
   *
   * There is no optimistic update: the server knows the merged quantity after an
   * add and the client cannot, so guessing would mean reconciling two truths.
   * The response *is* the new state. A failed mutation leaves `items` exactly
   * as it was and surfaces `error`, so the UI cannot claim a change that did
   * not happen.
   */
  const mutate = useCallback(
    async (run: () => Promise<CartClientResult>) => {
      const seq = ++sequence.current
      setPending(true)
      setError(null)

      const result = await run()

      // A newer request has taken over; its response will settle the state.
      if (seq !== sequence.current) return

      setPending(false)
      if (result.ok) {
        dispatch({ type: "hydrate", items: result.cart.items as unknown as CartItem[] })
      } else {
        setError(result.error)
      }
    },
    [],
  )

  const addItem = useCallback<CartContextValue["addItem"]>(
    (item, quantity = 1) => {
      const qty = Math.max(1, Math.floor(quantity))

      if (!userId) {
        // Anonymous: the reducer is the authority and needs the full snapshot.
        dispatch({ type: "add", item, quantity: qty })
        return
      }

      // A sizeless product cannot be represented server-side — the cart stores a
      // non-empty `size` — so this is refused here rather than as a round trip
      // that would come back as INVALID_SIZE.
      if (!item.size) {
        setError({
          code: "INVALID_SIZE",
          message: "Choose a size for that piece.",
          status: 400,
        })
        return
      }

      const productId = item.productId
      const size = item.size
      void mutate(() => apiAddCartItem({ productId, size, quantity: qty }))
    },
    [userId, mutate],
  )

  const removeItem = useCallback<CartContextValue["removeItem"]>(
    (lineId) => {
      const line = parseLineId(lineId)
      if (!line) return

      if (!userId) {
        dispatch({ type: "remove", lineId })
        return
      }

      void mutate(() => apiRemoveCartItem(line))
    },
    [userId, mutate],
  )

  const setQuantity = useCallback<CartContextValue["setQuantity"]>(
    (lineId, quantity) => {
      const line = parseLineId(lineId)
      if (!line) return

      if (!userId) {
        dispatch({ type: "setQuantity", lineId, quantity })
        return
      }

      // The server has no "set to zero" — removal is an explicit DELETE — so the
      // reducer's rule that a quantity below 1 drops the line is translated here
      // rather than sent as a value the API would reject.
      if (!Number.isFinite(quantity) || quantity < 1) {
        void mutate(() => apiRemoveCartItem(line))
        return
      }

      void mutate(() => apiSetCartItemQuantity({ ...line, quantity: Math.floor(quantity) }))
    },
    [userId, mutate],
  )

  const incrementItem = useCallback<CartContextValue["incrementItem"]>(
    (lineId) => {
      const current = state.items.find((entry) => entry.lineId === lineId)
      if (!current) return
      setQuantity(lineId, current.quantity + 1)
    },
    [state.items, setQuantity],
  )

  const decrementItem = useCallback<CartContextValue["decrementItem"]>(
    (lineId) => {
      const current = state.items.find((entry) => entry.lineId === lineId)
      if (!current) return
      // At 1 this drops the line, which is what the minus button being disabled
      // at 1 already implies.
      setQuantity(lineId, current.quantity - 1)
    },
    [state.items, setQuantity],
  )

  const clearCart = useCallback(() => {
    if (!userId) {
      dispatch({ type: "clear" })
      return
    }
    void mutate(() => apiClearCart())
  }, [userId, mutate])

  const retry = useCallback(() => {
    void load()
  }, [load])

  const dismissError = useCallback(() => setError(null), [])

  const value = useMemo<CartContextValue>(() => {
    return {
      items: state.items,
      count: getCartCount(state.items),
      subtotal: getCartSubtotal(state.items),
      hydrated: state.hydrated,
      pending,
      error,
      isServerCart,
      addItem,
      removeItem,
      setQuantity,
      incrementItem,
      decrementItem,
      clearCart,
      retry,
      dismissError,
    }
  }, [
    state.items,
    state.hydrated,
    pending,
    error,
    isServerCart,
    addItem,
    removeItem,
    setQuantity,
    incrementItem,
    decrementItem,
    clearCart,
    retry,
    dismissError,
  ])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a <CartProvider>")
  }
  return context
}

/** Re-exported so consumer components import from one place. */
export type { CartItem, CartState, CartAction }