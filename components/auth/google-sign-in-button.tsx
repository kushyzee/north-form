"use client"

import { useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AUTH_CALLBACK_PATH } from "@/lib/auth/redirect"
import { createClient } from "@/lib/supabase/client"

/**
 * The Google "G". Decorative only — the button's text carries the accessible
 * name, so the mark is hidden from assistive technology.
 */
function GoogleMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.28 6.61l4 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  )
}

const START_FAILED_MESSAGE =
  "We couldn't reach Google just now. Check your connection and try again."

/**
 * Starts the Supabase Google OAuth flow.
 *
 * `redirectTo` is built from `window.location.origin`, so the same code works
 * on localhost, a preview deployment and production without a hardcoded host.
 * The provider returns to `AUTH_CALLBACK_PATH`, which exchanges the code for a
 * session server-side. Nothing about the session is handled here.
 */
export function GoogleSignInButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    // `pending` is React state and is not updated until the next render, so
    // this guard is what actually stops a second click from opening two OAuth
    // requests in the same tick.
    if (pending) return

    setPending(true)
    setError(null)

    try {
      const redirectUrl = new URL(AUTH_CALLBACK_PATH, window.location.origin)
      // `next` was already validated by the caller, and URLSearchParams encodes
      // it for us.
      if (next !== "/") {
        redirectUrl.searchParams.set("next", next)
      }

      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl.toString() },
      })

      // On success the browser is already navigating to Google, so this code
      // only runs when the redirect could not be started.
      if (oauthError) {
        console.error("[auth] signInWithOAuth failed:", oauthError.message)
        setError(START_FAILED_MESSAGE)
        setPending(false)
      }
    } catch (cause) {
      console.error("[auth] signInWithOAuth threw:", cause)
      setError(START_FAILED_MESSAGE)
      setPending(false)
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <GoogleMark />
        )}
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>

      {/* Always present so the region is registered before it has content. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-4 min-h-5 text-center text-sm text-destructive"
      >
        {error}
      </p>
    </div>
  )
}