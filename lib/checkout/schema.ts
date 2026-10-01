/**
 * The checkout form contract.
 *
 * One Zod schema, used by React Hook Form through `zodResolver` in the browser
 * and reusable by the Phase 5B server-side order-creation path. Defining it once
 * is what keeps a hand-typed "Lagos" from reaching `orders.delivery_state` with
 * whatever spelling the customer used.
 *
 * Every message is written for the customer. Raw Zod issues ("Invalid input:
 * expected string") are never shown — a field either passes or renders the
 * sentence below, and the schema rejects unknown state names outright.
 */

import { z } from "zod"

import { NIGERIAN_STATES } from "@/lib/checkout/nigeria-states"
import { isValidNigerianPhone } from "@/lib/checkout/phone"

export const checkoutSchema = z.object({
  fullName: z
    .string({ error: "Enter your full name." })
    .trim()
    .min(2, "Enter your full name.")
    .max(80, "That name is too long."),

  // Trim first, then hand the cleaned value to the email format check, so a
  // trailing space is forgiven but a genuinely malformed address is not.
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .min(1, "Enter your email address.")
    .pipe(z.email({ error: "Enter a valid email address." })),

  phone: z
    .string({ error: "Enter your phone number." })
    .trim()
    .min(1, "Enter your phone number.")
    .refine(
      isValidNigerianPhone,
      "Enter a Nigerian phone number, for example 0801 234 5678 or +234 801 234 5678.",
    ),

  address: z
    .string({ error: "Enter your delivery address." })
    .trim()
    .min(4, "Enter your delivery address.")
    .max(200, "That address is too long."),

  city: z
    .string({ error: "Enter your city." })
    .trim()
    .min(2, "Enter your city.")
    .max(80, "That city name is too long."),

  // A closed set: the form's <Select> can only offer these, and an enum rejects
  // anything else (a stale localStorage value, a hand-edited request) instead
  // of storing a free-text state on the order.
  state: z.enum(NIGERIAN_STATES, { error: "Select your state." }),
})

/** Validated checkout form values. */
export type CheckoutFormValues = z.infer<typeof checkoutSchema>
