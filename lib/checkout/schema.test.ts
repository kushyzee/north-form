import { describe, expect, it } from "vitest"

import { checkoutSchema, type CheckoutFormValues } from "@/lib/checkout/schema"

const validDetails: CheckoutFormValues = {
  fullName: "Ade Okafor",
  email: "ade.okafor@example.com",
  phone: "0801 234 5678",
  address: "14 Adeniyi Jones Avenue",
  city: "Ikeja",
  state: "Lagos",
}

/** Parses and returns the human-facing message for a single field. */
function messageFor(field: keyof CheckoutFormValues, value: unknown): string {
  const result = checkoutSchema.safeParse({ ...validDetails, [field]: value })
  if (result.success) {
    throw new Error(`Expected "${field}" to be rejected, but it passed.`)
  }
  return result.error.issues[0]?.message ?? ""
}

describe("checkoutSchema", () => {
  it("accepts complete, well-formed customer and delivery details", () => {
    const result = checkoutSchema.safeParse(validDetails)
    expect(result.success).toBe(true)
  })

  it("trims surrounding whitespace from text fields", () => {
    const result = checkoutSchema.safeParse({
      ...validDetails,
      fullName: "  Ade Okafor  ",
      city: " Ikeja ",
    })
    expect(result.success).toBe(true)
    expect(result.success && result.data.fullName).toBe("Ade Okafor")
    expect(result.success && result.data.city).toBe("Ikeja")
  })

  it("rejects a missing name", () => {
    expect(messageFor("fullName", "")).toBe("Enter your full name.")
    expect(messageFor("fullName", "   ")).toBe("Enter your full name.")
  })

  it("rejects a missing or malformed email", () => {
    expect(messageFor("email", "")).toBe("Enter your email address.")
    expect(messageFor("email", "not-an-email")).toBe("Enter a valid email address.")
  })

  it("rejects a missing phone number", () => {
    expect(messageFor("phone", "")).toBe("Enter your phone number.")
  })

  it("rejects a phone number that is not Nigerian", () => {
    const result = checkoutSchema.safeParse({
      ...validDetails,
      phone: "12345",
    })
    expect(result.success).toBe(false)
  })

  it("accepts the common Nigerian phone formats", () => {
    const formats = [
      "08012345678",
      "0801 234 5678",
      "0801-234-5678",
      "+234 801 234 5678",
      "2348012345678",
      "(0801) 2345678",
    ]

    for (const phone of formats) {
      const result = checkoutSchema.safeParse({ ...validDetails, phone })
      expect(result.success, `expected ${phone} to be accepted`).toBe(true)
    }
  })

  it("rejects a missing address", () => {
    expect(messageFor("address", "")).toBe("Enter your delivery address.")
  })

  it("rejects a missing city", () => {
    expect(messageFor("city", "")).toBe("Enter your city.")
  })

  it("rejects a missing state", () => {
    expect(messageFor("state", "")).toBe("Select your state.")
  })

  it("rejects a state that is not a canonical Nigerian state", () => {
    // Guards against a hand-edited request or stale client state reaching the
    // order as free text.
    const result = checkoutSchema.safeParse({ ...validDetails, state: "Lagos State" })
    expect(result.success).toBe(false)
  })

  it("reports every missing field at once, so a form can highlight them together", () => {
    const result = checkoutSchema.safeParse({
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
    })

    expect(result.success).toBe(false)
    if (result.success) return

    const fields = result.error.issues.map((issue) => issue.path[0])
    expect(new Set(fields)).toEqual(
      new Set(["fullName", "email", "phone", "address", "city", "state"]),
    )
  })
})