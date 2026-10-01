import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter } from "next/font/google";

import { AuthStatus } from "@/components/auth/auth-status";
import { CartProvider } from "@/components/cart/cart-provider";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getCategories } from "@/lib/catalogue/queries";

import "./globals.css";

// UI / body face — clean, neutral, highly legible at small sizes.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Editorial display face. Used for headings and the wordmark.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NORTH & FORM — Built for the way you move.",
    template: "%s — NORTH & FORM",
  },
  description:
    "Considered shirts, denim, footwear and heavyweight cotton for Nigerian men. Minimal, editorial, built to be worn.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Categories drive both the header/footer links. Fetched once here so every
  // route shares them rather than re-querying per page.
  const categories = await getCategories();

  return (
    <html
      lang="en"
      className={`h-full antialiased ${geistMono.variable} ${inter.variable} ${instrumentSerif.variable}`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <CartProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Skip to content
          </a>
          {/* AuthStatus is a Server Component; passing it as children keeps
              SiteHeader a Client Component for the cart and mobile menu. */}
          <SiteHeader>
            <AuthStatus />
          </SiteHeader>
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter categories={categories} />
        </CartProvider>
      </body>
    </html>
  );
}
