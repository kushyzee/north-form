"use client"

import { useState } from "react"
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
 * NOTHING IS SUBMITTED. See `onSubmit`.
 */

/** Shown after a valid submit, while order creation does not exist yet. */
const NOT_YET_ENABLED =
  "Your details are valid. Order placement is not enabled yet — no order was created and nothing has been charged."

/** Always visible under the button, so the limit is never a surprise. */
const SUBMIT_CAPTION =
  "Order placement is not enabled in this release. Submitting does not create an order."

export function CheckoutForm({
  profile,
}: {
  profile: CheckoutProfileDefaults | null
}) {
  const { items, subtotal } = useCart()
  const [notice, setNotice] = useState<string | null>(null)

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
   * PHASE 5A PLACEHOLDER — this creates no order.
   *
   * Phase 5B replaces this function with the trusted server-side order-creation
   * call, which re-reads products, prices and stock, recomputes the delivery
   * fee from the validated state, and writes the order itself. That path must
   * never trust the values collected here: `subtotal`, `deliveryFee` and the
   * cart's `unitPrice` snapshots are display-only.
   *
   * Until then this deliberately does no network or database work. It does not
   * clear the cart, does not navigate, and does not claim an order exists —
   * there is nothing to persist, so a "success" message would be a lie. The
   * work is async so the pending state below is real, even though there is no
   * request to wait for yet.
   */
  async function onSubmit() {
    setNotice(NOT_YET_ENABLED)
  }

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
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="h-12 w-full sm:w-auto sm:px-10"
          >
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : null}
            {isSubmitting ? "Checking your details…" : "Place order"}
          </Button>

          <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            {SUBMIT_CAPTION}
          </p>

          {/* Always rendered so the region is registered before it has content. */}
          <p
            role="status"
            aria-live="polite"
            className="mt-3 max-w-md min-h-5 text-sm leading-relaxed text-muted-foreground"
          >
            {notice}
          </p>
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
