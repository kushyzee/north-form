import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { requireAuthUser } from "@/lib/auth/session"
import { getOrderByNumber } from "@/lib/orders/queries"
import { DEMO_BANK_TRANSFER, isAwaitingPayment } from "@/lib/orders/payment-details"
import { formatNaira } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Order received",
  description: "Your NORTH & FORM order has been received and is awaiting payment.",
}

type ConfirmationPageProps = PageProps<"/checkout/confirmation/[orderNumber]">

/**
 * Order confirmation.
 *
 * Everything on this page is read back from the database through
 * `getOrderByNumber` — the order number, the totals and the line items. Nothing
 * is taken from the checkout form or the URL, so a customer cannot be shown a
 * total their order does not have.
 *
 * The order number in the URL is an address, not an authorisation. RLS decides
 * what may be read: `getOrderByNumber` takes no user id and runs as the caller's
 * own session, so somebody else's order number resolves to nothing and this 404s.
 *
 * That is also why a `loading.tsx` must never be added here: a route loading file
 * wraps the page in a Suspense boundary that flushes before the page body runs,
 * which downgrades `requireAuthUser`'s redirect from a `307` to a `200` carrying
 * a meta-refresh. See the Checkout section in AGENTS.md.
 */
export default async function OrderConfirmationPage({
  params,
}: ConfirmationPageProps) {
  const { orderNumber } = await params

  // Signed out, come back to *this* order rather than to the checkout page.
  await requireAuthUser(`/checkout/confirmation/${orderNumber}`)
  const order = await getOrderByNumber(orderNumber)

  if (!order) notFound()

  const awaitingPayment = isAwaitingPayment(order.status)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          North <span aria-hidden="true">&amp;</span> Form
        </p>

        <CheckCircle2 aria-hidden="true" className="mt-6 size-8 text-brand-olive" />

        <h1 className="mt-4 font-heading text-3xl tracking-tight sm:text-4xl">
          Order received
        </h1>

        {/* Status comes from the database. The wording never claims the money
            has arrived: payment verification is a later phase and the order
            stays `awaiting_payment` until a human moves it. */}
        <p className="mt-4 inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide uppercase">
          {awaitingPayment ? "Payment pending" : order.status.replace(/_/g, " ")}
        </p>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {awaitingPayment
            ? "We have your order and we have not received your payment yet. Transfer the total using the details below, quoting your order reference."
            : "Your order is recorded with the status above."}{" "}
          We will use {order.customerEmail} to keep you updated.
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Quote this reference if you need to get in touch about the order:
        </p>

        <p className="mt-2 font-mono text-xl tracking-tight">{order.orderNumber}</p>
{/* What was ordered, at the prices the database recorded. */}
        <section aria-labelledby="confirmation-items" className="mt-10">
          <h2 id="confirmation-items" className="font-heading text-lg">
            What you ordered
          </h2>

          <ul className="mt-4 divide-y divide-border border-y border-border">
            {order.items.map((item, index) => (
              <li
                key={`${item.productName}-${item.size}-${index}`}
                className="flex items-start justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Size {item.size} · {item.quantity} ×{" "}
                    {formatNaira(item.unitPrice)}
                  </p>
                </div>
                <p className="shrink-0 text-sm tabular-nums">
                  {formatNaira(item.unitPrice * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">
                {formatNaira(order.subtotal)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Delivery{order.deliveryCity ? ` to ${order.deliveryCity}` : ""}
              </dt>
              <dd className="tabular-nums">{formatNaira(order.deliveryFee)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <span className="font-medium">Total to transfer</span>
            <span className="font-heading text-2xl tabular-nums">
              {formatNaira(order.total)}
            </span>
          </div>
        </section>
{/* Payment instructions. Marked as demonstration details because they
            are — this storefront has no real account. */}
        <section aria-labelledby="confirmation-payment" className="mt-10">
          <h2 id="confirmation-payment" className="font-heading text-lg">
            How to pay
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We do not take card payments. Transfer{" "}
            <span className="font-medium text-foreground">
              {formatNaira(order.total)}
            </span>{" "}
            to the account below, quoting{" "}
            <span className="font-mono text-foreground">{order.orderNumber}</span>{" "}
            as the reference.
          </p>

          <dl className="mt-4 rounded-lg border border-border bg-card p-5 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="font-medium">{DEMO_BANK_TRANSFER.bank}</dd>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Account name</dt>
              <dd className="font-medium">{DEMO_BANK_TRANSFER.accountName}</dd>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Account number</dt>
              {/* Monospace and selectable so it can be copied accurately. */}
              <dd className="font-mono text-base font-medium tracking-wider [user-select:all]">
                {DEMO_BANK_TRANSFER.accountNumber}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            These are demonstration bank details for this storefront.
          </p>

          <p className="mt-4 text-sm leading-relaxed">
            <span className="font-medium">Payment is not yet received.</span>{" "}
            <span className="text-muted-foreground">
              Your order stays awaiting payment until we confirm the transfer
              ourselves. Nothing on this page marks it as paid.
            </span>
          </p>
        </section>

        <section aria-labelledby="confirmation-delivery" className="mt-10">
          <h2 id="confirmation-delivery" className="font-heading text-lg">
            Delivering to
          </h2>
          <address className="mt-3 text-sm leading-relaxed not-italic text-muted-foreground">
            {order.customerName}
            <br />
            {order.deliveryAddress}
            <br />
            {order.deliveryCity}, {order.deliveryState}
            <br />
            {order.customerPhone}
          </address>
        </section>

        <div className="mt-12">
          <Link href="/shop" className={cn(buttonVariants({ size: "lg" }))}>
            Continue shopping
          </Link>
        </div>

        {/* Announced as well as rendered. */}
        <p className="sr-only" role="status">
          Order {order.orderNumber} created. Total {formatNaira(order.total)},
          awaiting payment.
        </p>
      </div>
    </div>
  )
}