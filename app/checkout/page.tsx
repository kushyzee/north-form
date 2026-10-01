import type { Metadata } from "next"

import { CheckoutView } from "@/components/checkout/checkout-view"
import { requireAuthUser } from "@/lib/auth/session"
import { getCheckoutProfile } from "@/lib/checkout/profile"

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Enter your contact and delivery details, and review your NORTH & FORM order.",
}

/**
 * Checkout route — the first opt-in for the auth guard.
 *
 * `requireAuthUser` redirects an anonymous visitor to `/auth?next=%2Fcheckout`,
 * and the existing OAuth callback returns them here afterwards. It is the only
 * place this route is protected: `proxy.ts` still does nothing but refresh the
 * session, and no blanket protection is added, so the storefront stays public.
 *
 * The returned `user.id` comes from verified claims, never from the browser, and
 * the profile read below is additionally scoped by the `profiles` RLS policy.
 */
export default async function CheckoutPage() {
  const user = await requireAuthUser("/checkout")
  const profile = await getCheckoutProfile(user.id)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          Checkout
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Tell us where to send it. We deliver across Nigeria, and your state
          sets the delivery fee.
        </p>
      </header>

      <div className="mt-10">
        {/* Client Component: the cart lives in browser storage. */}
        <CheckoutView profile={profile} />
      </div>
    </div>
  )
}