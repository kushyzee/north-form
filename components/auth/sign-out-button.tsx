"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type SignOutButtonProps = {
  variant?: "ghost" | "outline"
  size?: "sm" | "lg"
  className?: string
}

/**
 * Signs the user out through Supabase Auth.
 *
 * Supabase owns the session lifecycle and clears its own cookies — nothing is
 * deleted by hand here. `router.refresh()` re-renders the server tree so every
 * `getAuthUser()` read, the header included, reflects the cleared session
 * immediately rather than on the next navigation.
 */
export function SignOutButton({
  variant = "ghost",
  size = "sm",
  className,
}: SignOutButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    if (pending) return

    setPending(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      // The session may already be gone server-side. The UI is still refreshed
      // so the header reflects reality either way.
      console.error("[auth] signOut failed:", error.message)
    }

    router.refresh()
    setPending(false)
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleSignOut}
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      <LogOut aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  )
}