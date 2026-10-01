"use client"

import { useState } from "react"
import Link from "next/link"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"

import { useCart } from "@/components/cart/cart-provider"
import { CheckoutField } from "@/components/checkout/checkout-field"
import { OrderSummary } from "@/components/checkout/order-summary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getDeliveryFee, getDeliveryRegion } from "@/lib/checkout/delivery"
import { NIGERIAN_STATES, STATE_PLACEHOLDER } from "@/lib/checkout/nigeria-states"
import type { CheckoutProfileDefaults } from "@/lib/checkout/profile"
import { checkoutSchema, type CheckoutFormValues } from "@/lib/checkout/schema"

/**
 * Checkout form.
 *
 * Client Component: the cart lives in browser storage, so the summary and the
 * delivery fee follow the customer's cart and their chosen state. The Server
 * Component above it supplies only the saved profile defaults, read from the
 * caller's own row.
 *
 * Validation is React Hook Form driven by the shared Zod schema, in `onTouched`
 * mode: a field is checked when the customer leaves it and then keeps updating
 * as they correct it, but nothing is flagged while they are still typing the
 * first time. A failed submit moves focus to the first invalid field, and every
 * message is associated with its control and announced.
 *
 * Submitting calls `POST /api/orders`. The summary above is a preview — the
 * order is priced and created by the database, and the confirmation page reads
 * that order back rather than trusting anything rendered here.
 */

/** Always visible under the button, so the next step is never a surprise. */
const SUBMIT_CAPTION =
  "We will ask you to transfer the total by bank transfer once your order is confirmed."

/**
 * Fallback copy when the API answers without a message we can show. The API
 * only ever sends messages written for customers, so this is a last resort.
 */
function readApiError(payload: unknown, status: number): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload
  ) {
    const { error } = payload as { error?: { message?: unknown } }
    if (typeof error?.message === "string" && error.message.length > 0) {
      return error.message
    }
  }

  return status >= 500
    ? "Something went wrong on our side. Your order was not created — please try again."
    : "We could not place that order. Please check your details and try again."
}

export function CheckoutForm({
  profile,
  onOrderPlaced,
}: {
  profile: CheckoutProfileDefaults | null
  /** Called only after the API confirms the order was created. */
  onOrderPlaced: (orderNumber: string) => void
}) {
  const { items, subtotal } = useCart()
  const [error, setError] = useState<string | null>(null)

  // Guards a second submit that never touches the button: pressing Enter in a
  // field fires `submit` again, and React Hook Form does not serialise handlers
  // itself. `isSubmitting` alone cannot close this either, because the button is
  // not the only way to submit a form.
  //
  // State rather than a ref: two Enter presses are two separate DOM events, so
  // React has already flushed this before the second one runs. A ref would also
  // have to be read inside a handler that the compiler cannot prove is event
  // code.
  const [inFlight, setInFlight] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      // Profile values are pre-filled only. They are the customer's to edit,
      // and Phase 5A does not write them back to `profiles`.
      fullName: profile?.fullName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: "",
      city: "",
      // `state` is intentionally absent: it has no saved default, and leaving
      // it undefined lets the enum report "Select your state." on an empty
      // submit instead of failing against a cast placeholder.
    },
    mode: "onTouched",
  })

  // The summary reflects the state the customer is looking at right now. Until
  // one is chosen the fee is unknown, which the summary renders as such rather
  // than defaulting to a number that may be wrong.
  //
  // `useWatch` rather than `watch()`: it subscribes this component to a single
  // field, so changing state re-renders the summary without the compiler having
  // to reason about the whole form.
  const selectedState = useWatch({ control, name: "state" })
  const deliveryFee = selectedState ? getDeliveryFee(selectedState) : null
  const deliveryRegion = selectedState ? getDeliveryRegion(selectedState) : null

  /**
   * PHASE 5B-2 — places a real order.
   *
   * The browser sends only what the customer typed plus the cart lines. It does
   * not send, and the API does not accept, any price, subtotal, fee, total,
   * status or user id: `POST /api/orders` answers `201` only after
   * `private.place_order` has created the order server-side.
   *
   * Nothing here is treated as a result until that response arrives. The
   * summary numbers the customer has been looking at are the cart's add-time
   * snapshots; the order that was actually created is described by the
   * database's own totals, which is why the confirmation is a separate page
   * that re-reads the order instead of echoing this form.
   */
  async function onSubmit(values: CheckoutFormValues) {
    if (inFlight) return
    setInFlight(true)

    setError(null)

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          cart: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            size: item.size,
          })),
        }),
      })

      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        // A mapped business failure carries a message written for customers;
        // anything else gets a generic line, because the API never forwards a
        // raw database error.
        setError(readApiError(payload, response.status))
        return
      }

      const placed = payload as { orderNumber?: unknown } | null
      if (typeof placed?.orderNumber !== "string") {
        setError(
          "Your order may not have gone through. Please check with us before trying again.",
        )
        return
      }

      onOrderPlaced(placed.orderNumber)
    } catch {
      // Offline, DNS failure, aborted request — the order may or may not have
      // reached us, so the copy asks the customer to check rather than claiming
      // either outcome.
      setError(
        "We could not reach the server. Check your connection and try again — if you do, we may have to cancel one of the orders.",
      )
    } finally {
      setInFlight(false)
    }
  }

  const busy = isSubmitting || inFlight

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      // Browser-native bubbles would compete with our messages; required-ness
      // is expressed by the schema instead.
      noValidate
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16"
    >
      <div className="min-w-0 space-y-10">
        {/* Contact */}
        <section aria-labelledby="checkout-contact-heading">
          <h2
            id="checkout-contact-heading"
            className="font-heading text-xl tracking-tight"
          >
            Contact
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            How we reach you about this order.
          </p>

          <div className="mt-5 space-y-5">
            <CheckoutField
              id="fullName"
              label="Full name"
              error={errors.fullName?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  {...register("fullName")}
                  autoComplete="name"
                  className="h-11"
                />
              )}
            </CheckoutField>

            <div className="grid gap-5 sm:grid-cols-2">
              <CheckoutField
                id="email"
                label="Email"
                error={errors.email?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    {...register("email")}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="h-11"
                  />
                )}
              </CheckoutField>

              <CheckoutField
                id="phone"
                label="Phone"
                error={errors.phone?.message}
                hint="Mobile or landline."
              >
                {(control) => (
                  <Input
                    {...control}
                    {...register("phone")}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0801 234 5678"
                    className="h-11"
                  />
                )}
              </CheckoutField>
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section aria-labelledby="checkout-delivery-heading">
          <h2
            id="checkout-delivery-heading"
            className="font-heading text-xl tracking-tight"
          >
            Delivery
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We deliver across Nigeria. Your state sets the delivery fee shown in
            the summary.
          </p>

          <div className="mt-5 space-y-5">
            <CheckoutField
              id="address"
              label="Delivery address"
              error={errors.address?.message}
            >
              {(control) => (
                <Textarea
                  {...control}
                  {...register("address")}
                  autoComplete="street-address"
                  rows={3}
                  placeholder="Street address, area, and any landmark that helps the rider"
                />
              )}
            </CheckoutField>

            <div className="grid gap-5 sm:grid-cols-2">
              <CheckoutField
                id="city"
                label="City"
                error={errors.city?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    {...register("city")}
                    autoComplete="address-level2"
                    className="h-11"
                  />
                )}
              </CheckoutField>

              <CheckoutField
                id="state"
                label="State"
                error={errors.state?.message}
              >
                {(fieldProps) => (
                  <Controller
                    name="state"
                    control={control}
                    render={({ field }) => (
                      <Select
                        name="state"
                        value={field.value ?? null}
                        onValueChange={(value) => {
                          field.onChange(value)
                          field.onBlur()
                        }}
                      >
                        {/* `ref` lets React Hook Form move focus to the trigger
                            when a submit fails here — the hidden input Base UI
                            submits is not a useful focus target. */}
                        <SelectTrigger
                          {...fieldProps}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className="h-11 w-full"
                        >
                          <SelectValue placeholder={STATE_PLACEHOLDER} />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </CheckoutField>
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="border-t border-border pt-8">
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            aria-busy={busy}
            className="h-12 w-full sm:w-auto sm:px-10"
          >
            {busy ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : null}
            {busy ? "Placing your order…" : "Place order"}
          </Button>

          <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            {SUBMIT_CAPTION}
          </p>

          {/* An order-level failure is not tied to one field, so it lives in a
              status region rather than beside an input. Always rendered so the
              region is registered before it has content. */}
          <p
            role="status"
            aria-live="polite"
            className="mt-4 max-w-md min-h-5 text-sm leading-relaxed"
          >
            {error ? <span className="text-destructive">{error}</span> : null}
          </p>

          {error ? (
            <p className="mt-2 max-w-md text-sm">
              <Link
                href="/cart"
                className="underline underline-offset-4 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Review your bag
              </Link>{" "}
              <span className="text-muted-foreground">to change what you ordered.</span>
            </p>
          ) : null}
        </div>
      </div>

      <OrderSummary
        items={items}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        deliveryRegion={deliveryRegion}
      />
    </form>
  )
}
