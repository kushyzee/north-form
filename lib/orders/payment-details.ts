/**
 * Bank-transfer details shown to the customer.
 *
 * **These are fictional demo details.** They do not belong to a real bank and
 * no money can reach NORTH & FORM through them. They exist because the payment
 * model is bank transfer rather than a gateway (see AGENTS.md → Payment model).
 *
 * One constant, imported by both the confirmation page and the order email, so
 * the two can never drift apart and show the customer two different accounts.
 */
export const DEMO_BANK_TRANSFER = {
  bank: "HNG Microfinance Bank",
  accountName: "North & Form Inc",
  accountNumber: "1028473615",
} as const

/**
 * True while the order has not been paid.
 *
 * The database owns the status; this only turns it into the wording the
 * customer sees. Nothing anywhere claims a payment has been received — payment
 * verification is a later phase, and an order created by `private.place_order`
 * stays `awaiting_payment` until a human moves it.
 */
export function isAwaitingPayment(status: string): boolean {
  return status === "awaiting_payment"
}