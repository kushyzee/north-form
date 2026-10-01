import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Lock } from "lucide-react"

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { buttonVariants } from "@/components/ui/button"
import { safeRedirectPath } from "@/lib/auth/redirect"
import { getAuthUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to NORTH & FORM with Google to check out your order.",
}

/**
 * Copy for the opaque error codes emitted by `app/auth/callback/route.ts` and
 * by the Google button.
 *
 * The codes are deliberately generic: the provider's or database's own message
 * is logged server-side and never rendered, so nothing internal leaks into the
 * page.
 */
const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled before it finished. Nothing has changed — you can try again.",
  failed: "We couldn't complete sign-in with Google. Please try again.",
  missing_code: "That sign-in link has expired or has already been used. Please start again.",
  callback: "We couldn't complete sign-in. Please try again.",
}

/** `searchParams` is a Request-time API — values are unknown ahead of time. */
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function AuthPage(props: PageProps<"/auth">) {
  const searchParams = await props.searchParams

  // `next` arrives from a URL and is attacker-controlled, so it is narrowed to
  // a safe internal path before it can reach a link or a redirect.
  const next = safeRedirectPath(firstParam(searchParams.next))
  const errorMessage = ERROR_MESSAGES[firstParam(searchParams.error) ?? ""]

  // Read from cookies, so this route is dynamically rendered like the rest of
  // the storefront — no `revalidate` export here.
  const user = await getAuthUser()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <Lock aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <h1 className="mt-6 font-heading text-3xl tracking-tight sm:text-4xl">
            Sign in to continue
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            An account is required when you check out — it keeps your order and
            delivery details together. Browsing the shop and filling your cart
            never need one.
          </p>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-8 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        {user ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-6">
            <h2 className="font-heading text-lg">You&rsquo;re already signed in</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {user.email ? `Signed in as ${user.email}.` : "You are signed in."}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={next}
                className={cn(buttonVariants({ size: "lg" }), "flex-1")}
              >
                Continue
                <ArrowRight aria-hidden="true" />
              </Link>
              <SignOutButton variant="outline" size="lg" />
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <GoogleSignInButton next={next} />
          </div>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          We ask Google only for your name and email address. We never see or
          store your Google password.
        </p>
      </div>
    </div>
  )
}