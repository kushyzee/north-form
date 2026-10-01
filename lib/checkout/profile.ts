import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Saved customer details, used to pre-fill the checkout form.
 *
 * This module only *reads*. Profile persistence is explicitly out of Phase 5A:
 * the form is a snapshot the customer can edit, and nothing here writes back to
 * `profiles` or creates a row. The `on_auth_user_created` trigger still owns row
 * creation, so there is no insert path to add here.
 *
 * The row is fetched with the *verified* user id that comes from
 * `requireAuthUser()` — never an id the browser supplied — and the existing RLS
 * policy (`auth.uid() = id`) scopes the read to the caller's own row.
 */

/** Defaults for the checkout form. Empty strings mean "ask the customer". */
export type CheckoutProfileDefaults = {
  fullName: string
  email: string
  phone: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * The signed-in customer's profile, or `null` when there is nothing to pre-fill.
 *
 * Returning `null` is a normal outcome, not an error: the row is created by the
 * auth trigger but `phone` is usually absent (Google does not supply one), and
 * the form must work regardless.
 */
export async function getCheckoutProfile(
  userId: string,
): Promise<CheckoutProfileDefaults | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[checkout] getCheckoutProfile failed:", error.message)
    return null
  }

  if (!isRecord(data)) return null

  return {
    fullName: asString(data.full_name),
    email: asString(data.email),
    phone: asString(data.phone),
  }
}