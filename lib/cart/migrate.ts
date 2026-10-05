/**
 * The one-time migration of an anonymous `localStorage` cart into a signed-in
 * customer's server cart.
 *
 * The web cart has always worked without a session, so a first-time customer
 * arrives at `/checkout` with a real bag in browser storage. Signing in must
 * carry that bag across rather than silently dropping it — but the server cart
 * is authoritative from the moment it exists, so nothing from storage is trusted
 * as state. Every line is re-sent through `POST /api/cart/items` and the
 * database re-validates product, size and stock for each one.
 *
 * ## Why this is idempotent
 *
 * The migration is one logical operation spread over several requests, so it can
 * be interrupted — a reload mid-way, a dropped connection, a tab closed. Each
 * line is therefore sent with one shared `migrationId`, which the database
 * records against the line it created. Re-sending a line that already carries
 * that id is a no-op that returns the existing quantity, so a retry cannot
 * double a line. That guarantee lives in `private.add_cart_item`, not here.
 *
 * ## Why local storage is cleared last
 *
 * `localStorage` is cleared only after every line has been attempted. A
 * business rejection (a retired product, a size that no longer exists, stock
 * that ran out) is *final* for that line — retrying will never succeed, so it is
 * dropped and reported rather than blocking the rest. A transport failure is not
 * final, so the cart stays put and the whole migration can run again.
 */

import type { CartClientResult } from "@/lib/cart/cart-client"
import type { CartItem } from "@/lib/cart/reducer"

/** What happened to one local line. */
export type MigratedLine = {
  lineId: string
  productName: string
  /** `migrated` — accepted by the server. `dropped` — permanently refused. */
  outcome: "migrated" | "dropped"
  /** Set only for a dropped line: the server's customer-safe reason. */
  reason?: string
}

export type MigrationResult = {
  migrated: MigratedLine[]
  dropped: MigratedLine[]
  /**
   * True when the migration finished cleanly enough to discard local storage.
   * False on a transport or server failure, which means it should be retried.
   */
  complete: boolean
}

/** The one call this needs, so a test can drive it with a stub. */
export type AddLineFn = (input: {
  productId: string
  size: string
  quantity: number
  migrationId: string
}) => Promise<CartClientResult>

/**
 * Error codes that will never succeed on a retry.
 *
 * A product that no longer exists, a size it does not offer, or a quantity
 * above current stock are facts about the catalogue, not transient conditions.
 * Retrying them wastes a round trip and would block the migration forever, so
 * the line is dropped and the customer is told.
 *
 * Anything *not* in this list — including `CART_FAILED` and `NETWORK_ERROR` —
 * leaves the migration incomplete on purpose.
 */
const FINAL_REJECTIONS = new Set([
  "PRODUCT_NOT_FOUND",
  "INVALID_SIZE",
  "INVALID_QUANTITY",
  "CART_ITEM_NOT_FOUND",
  // Stock is the one rejection here that is per-line rather than per-product: a
  // shopper who had 3 of an item and only 2 remain should still have their
  // other lines migrated. Leaving it out would abandon the whole bag to a single
  // line that can never succeed.
  "INSUFFICIENT_STOCK",
])

/**
 * Merges an anonymous cart into the server cart.
 *
 * Lines are sent one at a time and in order. That is deliberate: the server's
 * per-line stock ceiling means the outcome of one line never depends on another,
 * so a single sequential pass is both the simplest thing that works and the
 * easiest to reason about when a request fails half way.
 */
export async function migrateLocalCart(input: {
  items: CartItem[]
  addLine: AddLineFn
  newMigrationId?: MigrationIdFactory
}): Promise<MigrationResult> {
  const { items, addLine } = input
  const newMigrationId = input.newMigrationId ?? defaultMigrationId

  const migrated: MigratedLine[] = []
  const dropped: MigratedLine[] = []

  // One id for the whole pass, so a retry is recognised as the same operation.
  const migrationId = newMigrationId()
  let complete = true

  for (const item of items) {
    // A sizeless product cannot be represented server-side: the cart stores a
    // non-empty `size`. Every seeded product has sizes, so this only fires for
    // a catalogue change, and dropping it with a reason beats a silent loss.
    if (!item.size) {
      dropped.push({
        lineId: item.lineId,
        productName: item.productName,
        outcome: "dropped",
        reason: "That piece no longer has a selectable size.",
      })
      continue
    }

    const result = await addLine({
      productId: item.productId,
      size: item.size,
      quantity: item.quantity,
      migrationId,
    })

    if (result.ok) {
      migrated.push({
        lineId: item.lineId,
        productName: item.productName,
        outcome: "migrated",
      })
      continue
    }

    if (FINAL_REJECTIONS.has(result.error.code)) {
      dropped.push({
        lineId: item.lineId,
        productName: item.productName,
        outcome: "dropped",
        reason: result.error.message,
      })
      continue
    }

    // Transport or server failure. Nothing is certain about this line or the
    // ones after it, so the migration is not complete and local storage is kept
    // for a retry.
    complete = false
    break
  }

  return { migrated, dropped, complete }
}

/**
 * Generates a migration id.
 *
 * Injected so a test is deterministic, and so a retry can reuse one id rather
 * than minting a new one each attempt.
 */
export type MigrationIdFactory = () => string

function defaultMigrationId(): string {
  // `crypto.randomUUID` is available in every browser this app supports. The
  // fallback keeps this working in a non-secure context rather than throwing.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `mig-${Date.now()}-${Math.random().toString(36).slice(2)}`
}