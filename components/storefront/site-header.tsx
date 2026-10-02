"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShoppingBag } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/components/cart/cart-provider";
import { formatItemCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_LINKS = [{ href: "/shop", label: "Shop all" }] as const;

/**
 * Persistent storefront header.
 *
 * Client-side because it reads the live cart count and owns the mobile
 * navigation dialog. The brand wordmark and links themselves are static.
 *
 * `children` is rendered in the actions cluster and is how the server-rendered
 * `AuthStatus` reaches the header without this component having to become an
 * async Server Component. It stays a plain presentational node with no props.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const { count, hydrated } = useCart();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="font-heading text-lg tracking-[0.18em] whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          NORTH <span aria-hidden="true">&amp;</span> FORM
        </Link>

        <span className="hidden text-xs tracking-wide text-muted-foreground lg:inline">
          Built for the way you move.
        </span>

        <nav
          aria-label="Main"
          className="ml-auto hidden items-center gap-6 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "text-sm tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none",
                isActive(link.href)
                  ? "text-foreground underline underline-offset-8"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {/* Server-rendered sign-in state (see components/auth/auth-status.tsx). */}
          {children}

          {/* Navigation target, so it renders a real <a> and only borrows the
            button's styling. `render={<Link />}` on <Button> would make Base
            UI emit an anchor where it expects a native button. */}
          <Link
            href="/cart"
            aria-label={`Cart, ${hydrated ? formatItemCount(count) : "loading"}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-lg" }),
              "relative",
            )}
          >
            <ShoppingBag aria-hidden="true" />
            {hydrated && count > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-olive px-1 text-[10px] leading-none font-medium text-brand-canvas"
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>

          {/* Mobile navigation — Base UI dialog, so focus is trapped,
              Escape closes it, and it is announced as a modal. */}
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="w-3/4 max-w-sm">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>
                  Browse the NORTH &amp; FORM catalogue.
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-3 text-base tracking-wide transition-colors",
                      isActive(link.href)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <SheetClose className="w-full text-left">
                      {link.label}
                    </SheetClose>
                  </Link>
                ))}
                <Link
                  href="/cart"
                  className="rounded-md px-3 py-3 text-base tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <SheetClose className="w-full text-left">
                    Cart{hydrated && count > 0 ? ` (${count})` : ""}
                  </SheetClose>
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
