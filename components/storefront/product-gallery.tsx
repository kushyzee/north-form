"use client"

import Image from "next/image"
import { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Product image gallery.
 *
 * Client Component only because the selected image is local UI state. The
 * images themselves come from `products.images` in the database.
 *
 * Thumbnails are a radio group, so arrow keys move between them for free.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: string[]
  productName: string
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = images[selectedIndex]

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-4/5 overflow-hidden bg-brand-stone/30">
        {selected ? (
          <Image
            src={selected}
            // Index is 1-based so the alt text reads naturally.
            alt={`${productName} — image ${selectedIndex + 1} of ${images.length}`}
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-brand-stone/40 text-xs tracking-[0.2em] text-brand-charcoal uppercase">
            {productName}
          </div>
        )}
      </div>

      {images.length > 1 ? (
        <div
          role="radiogroup"
          aria-label={`${productName} images`}
          className="grid grid-cols-5 gap-3"
        >
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              role="radio"
              aria-checked={index === selectedIndex}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "relative aspect-4/5 overflow-hidden border-2 bg-brand-stone/30 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                index === selectedIndex
                  ? "border-brand-ink"
                  : "border-transparent hover:border-brand-stone",
              )}
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}