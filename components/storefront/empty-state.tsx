import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Shared empty/zero-result state. One component so "no catalogue", "no search
 * results" and "no category results" all read the same way.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: string
  description: string
  action?: { href: string; label: string }
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <h2 className="font-heading text-xl">{title}</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}