"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"

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
   * False on the server and during the first client render, before the
   * persisted cart has been read. Consumers that would otherwise flash a wrong
   * item count (the header badge) should wait for this.
   */
  hydrated: boolean
  addItem: (item: Omit<CartItem, "lineId" | "quantity">, quantity?: number) => void
  removeItem: (lineId: string) => void
  setQuantity: (lineId: string, quantity: number) => void
  incrementItem: (lineId: string) => void
  decrementItem: (lineId: string) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState)

  // Hydrate once on mount. Reading storage during render would break SSR
  // (no `window`, and the server has no way to know the user's cart).
  useEffect(() => {
    dispatch({ type: "hydrate", items: readStoredCart() })
  }, [])

  // Persist on every change, but only after hydration so we never immediately
  // overwrite a stored cart with the empty initial state.
  useEffect(() => {
    if (!state.hydrated) return
    writeStoredCart(state.items)
  }, [state.hydrated, state.items])

  const addItem = useCallback<CartContextValue["addItem"]>((item, quantity = 1) => {
    dispatch({ type: "add", item, quantity })
  }, [])

  const removeItem = useCallback((lineId: string) => {
    dispatch({ type: "remove", lineId })
  }, [])

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    dispatch({ type: "setQuantity", lineId, quantity })
  }, [])

  const incrementItem = useCallback((lineId: string) => {
    dispatch({ type: "increment", lineId })
  }, [])

  const decrementItem = useCallback((lineId: string) => {
    dispatch({ type: "decrement", lineId })
  }, [])

  const clearCart = useCallback(() => {
    dispatch({ type: "clear" })
  }, [])

  const value = useMemo<CartContextValue>(() => {
    return {
      items: state.items,
      count: getCartCount(state.items),
      subtotal: getCartSubtotal(state.items),
      hydrated: state.hydrated,
      addItem,
      removeItem,
      setQuantity,
      incrementItem,
      decrementItem,
      clearCart,
    }
  }, [
    state.items,
    state.hydrated,
    addItem,
    removeItem,
    setQuantity,
    incrementItem,
    decrementItem,
    clearCart,
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