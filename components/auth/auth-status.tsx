import Link from "next/link"
import { User } from "lucide-react"

import { SignOutButton } from "@/components/auth/sign-out-button"
import { getAuthUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

/**
 * Header authentication state.
 *
 * A Server Component, so the session is read from cookies and the header is
 * correct on the first paint — no client-side fetch, no flash of the wrong
 * state. `SiteHeader` stays a Client Component for the cart badge and the
 * mobile dialog; this node is handed to it as `children`.
 *
 * Deliberately minimal: a sign-in link, or a short signed-in indicator with a
 * sign-out control. No account menu — that belongs with order history.
 */
export async function AuthStatus() {
  const user = await getAuthUser()

  if (!user) {
    return (
      <Link
        href="/auth"
        className={cn(
          "rounded-md px-3 py-2 text-sm tracking-wide text-muted-foreground transition-colors",
          "hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none",
        )}
      >
        Sign in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {/* Hidden on the narrowest screens so the cart and menu keep their room;
          the "Sign out" control still makes the signed-in state obvious. */}
      <span
        className="hidden max-w-40 items-center gap-1.5 px-2 text-sm text-muted-foreground sm:inline-flex"
        title={user.email ?? undefined}
      >
        <User aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{user.email ?? "Signed in"}</span>
      </span>
      <SignOutButton />
    </div>
  )
}