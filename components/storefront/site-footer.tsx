import Link from "next/link"

import type { Category } from "@/lib/catalogue/types"

/** Server component — no interactivity, so it never needs to be a Client Component. */
export function SiteFooter({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-24 border-t border-border bg-brand-charcoal text-brand-canvas">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-heading text-lg tracking-[0.18em]">
              NORTH <span aria-hidden="true">&amp;</span> FORM
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-brand-stone">
              Built for the way you move. Considered essentials for Nigerian men,
              cut to be worn and worn again.
            </p>
          </div>

          <nav aria-label="Shop by category">
            <h2 className="text-xs tracking-[0.16em] text-brand-stone uppercase">
              Shop
            </h2>
            <ul className="mt-4 space-y-2.5">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="text-sm text-brand-canvas/85 transition-colors hover:text-brand-canvas focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/shop"
                  className="text-sm text-brand-canvas/85 transition-colors hover:text-brand-canvas focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  All products
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Help">
            <h2 className="text-xs tracking-[0.16em] text-brand-stone uppercase">
              Help
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/cart"
                  className="text-sm text-brand-canvas/85 transition-colors hover:text-brand-canvas focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Your cart
                </Link>
              </li>
              <li className="text-sm text-brand-stone">
                Delivery across Nigeria, 2&ndash;4 working days.
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-brand-canvas/15 pt-6 text-xs text-brand-stone sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} North &amp; Form. All rights reserved.</p>
          <p>Prices shown in Nigerian Naira (NGN).</p>
        </div>
      </div>
    </footer>
  )
}