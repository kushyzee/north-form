import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for Client Components (browser).
 *
 * Safe to import from `'use client'` components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
