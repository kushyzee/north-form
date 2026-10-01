import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * Catalogue image with a graceful fallback.
 *
 * Product images come from `products.images` in the database. `next.config.ts`
 * whitelists only the `placehold.co` host used by the seeded catalogue — see
 * the note there before adding an image source.
 *
 * The wrapper reserves a 4:5 box (the seeded images are 1000×1250) so the grid
 * never shifts as images load.
 */
export function ProductImage({
  src,
  alt,
  className,
  sizes,
  priority = false,
}: {
  src: string | null | undefined
  alt: string
  className?: string
  sizes: string
  priority?: boolean
}) {
  return (
    <div
      className={cn(
        "relative aspect-4/5 overflow-hidden bg-brand-stone/30",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex size-full items-center justify-center bg-brand-stone/40 text-xs tracking-[0.2em] text-brand-charcoal uppercase"
        >
          {alt}
        </div>
      )}
    </div>
  )
}