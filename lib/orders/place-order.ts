import "server-only"

import {
  mapPlacedOrder,
  type PlaceOrderFn,
} from "@/lib/orders/handle-place-order"
import { createClient } from "@/lib/supabase/server"

/**
 * The database call behind `POST /api/orders`.
 *
 * This is the only place the app reaches `private.place_order`, and it is
 * deliberately thin: it forwards the function's own named arguments and hands
 * back whatever it returns. It computes nothing — no totals, no status, no
 * order number — because the function is the authority for all of them.
 *
 * The call goes through `supabase.schema('private').rpc(...)`, which routes to
 * PostgREST with `Content-Profile: private`. That only works because Phase 5B-1
 * added `private` to `pgrst.db_schemas`; the function is not in `public`, and
 * `anon` holds neither EXECUTE on it nor USAGE on the schema.
 *
 * The client is the ordinary authenticated server client from
 * `lib/supabase/server.ts`, which reads the caller's session cookies. **No
 * service-role key is used anywhere**, so this request runs as the customer and
 * is subject to exactly the RLS policies any other client request would face.
 */
export const placeOrder: PlaceOrderFn = async (params) => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema("private")
    .rpc("place_order", params)

  if (error) {
    // Only the SQLSTATE and the function's own machine code are logged. The
    // request arguments are deliberately not: they are the customer's name,
    // email, phone and address.
    console.error(
      `[orders] place_order failed: ${error.code ?? "(no code)"} ${error.message ?? ""}`.trim(),
    )
    return { ok: false, error: { code: error.code, message: error.message } }
  }

  const order = mapPlacedOrder(data)
  if (!order) {
    // The function returns a fixed shape; if that ever changes we would rather
    // fail loudly than render an order confirmation with missing numbers.
    console.error("[orders] place_order returned an unrecognised shape")
    return { ok: false, error: null }
  }

  return { ok: true, order }
}