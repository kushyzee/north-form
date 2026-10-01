import { describe, expect, it } from "vitest"

import { orderRequestSchema, toRpcParams } from "@/lib/orders/schema"

const PRODUCT_A = "11111111-1111-4111-8111-111111111111"
const PRODUCT_B = "22222222-2222-4222-8222-222222222222"

const validRequest = {
  fullName: "Ade Okafor",
  email: "ade@example.test",
  phone: "0801 234 5678",
  address: "14 Adeniyi Jones Avenue",
  city: "Ikeja",
  state: "Lagos",
  cart: [{ productId: PRODUCT_A, quantity: 2, size: "M" }],
}

function rejects(payload: unknown): boolean {
  return !orderRequestSchema.safeParse(payload).success
}

describe("orderRequestSchema", () => {
  it("accepts a well-formed request", () => {
    expect(orderRequestSchema.safeParse(validRequest).success).toBe(true)
  })

  it("accepts several cart lines", () => {
    const result = orderRequestSchema.safeParse({
      ...validRequest,
      cart: [
        { productId: PRODUCT_A, quantity: 2, size: "M" },
        { productId: PRODUCT_B, quantity: 1, size: "L" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("requires the customer and delivery fields the form collects", () => {
    // Reuses checkoutSchema, so the API accepts exactly what the form validates.
    for (const field of [
      "fullName",
      "email",
      "phone",
      "address",
      "city",
      "state",
    ] as const) {
      expect(rejects({ ...validRequest, [field]: "" }), field).toBe(true)
    }
  })

  it("rejects an invalid email", () => {
    expect(rejects({ ...validRequest, email: "not-an-email" })).toBe(true)
  })

  it("rejects an invalid phone number", () => {
    expect(rejects({ ...validRequest, phone: "12345" })).toBe(true)
  })

  it("rejects a missing cart", () => {
    expect(rejects({ ...validRequest, cart: undefined })).toBe(true)
  })

  it("rejects an empty cart", () => {
    expect(rejects({ ...validRequest, cart: [] })).toBe(true)
  })

  it("rejects a malformed cart item", () => {
    expect(rejects({ ...validRequest, cart: ["just-a-string"] })).toBe(true)
  })

  it("rejects a product id that is not a UUID", () => {
    expect(
      rejects({ ...validRequest, cart: [{ productId: "not-a-uuid", quantity: 1, size: "M" }] }),
    ).toBe(true)
  })

  it("rejects a missing quantity", () => {
    expect(rejects({ ...validRequest, cart: [{ productId: PRODUCT_A, size: "M" }] })).toBe(true)
  })

  it("rejects a non-integer or non-positive quantity", () => {
    for (const quantity of [0, -1, 1.5, "2", null]) {
      expect(
        rejects({ ...validRequest, cart: [{ productId: PRODUCT_A, quantity, size: "M" }] }),
        String(quantity),
      ).toBe(true)
    }
  })

  it("rejects a missing or blank size", () => {
    expect(rejects({ ...validRequest, cart: [{ productId: PRODUCT_A, quantity: 1 }] })).toBe(true)
    expect(
      rejects({ ...validRequest, cart: [{ productId: PRODUCT_A, quantity: 1, size: "   " }] }),
    ).toBe(true)
  })

  it("rejects a state that is not canonical", () => {
    expect(rejects({ ...validRequest, state: "Lagos State" })).toBe(true)
    expect(rejects({ ...validRequest, state: "Abuja" })).toBe(true)
  })

  it("rejects a repeated product and size, because a line is productId::size", () => {
    expect(
      rejects({
        ...validRequest,
        cart: [
          { productId: PRODUCT_A, quantity: 1, size: "M" },
          { productId: PRODUCT_A, quantity: 2, size: "M" },
        ],
      }),
    ).toBe(true)
  })

  it("allows the same product in two different sizes", () => {
    expect(
      orderRequestSchema.safeParse({
        ...validRequest,
        cart: [
          { productId: PRODUCT_A, quantity: 1, size: "M" },
          { productId: PRODUCT_A, quantity: 1, size: "L" },
        ],
      }).success,
    ).toBe(true)
  })

  it("refuses unknown keys, so a forged money or identity field cannot travel", () => {
    // Strict, not Zod's default strip: a forged field is rejected outright.
    for (const forged of [
      { total: 1 },
      { subtotal: 1 },
      { deliveryFee: 0 },
      { unitPrice: 1 },
      { userId: PRODUCT_A },
      { status: "delivered" },
      { orderNumber: "NF-FORGED" },
      { stockQuantity: 999 },
    ]) {
      expect(rejects({ ...validRequest, ...forged }), JSON.stringify(forged)).toBe(true)
    }
  })

  it("refuses a forged key inside a cart line", () => {
    expect(
      rejects({
        ...validRequest,
        cart: [{ productId: PRODUCT_A, quantity: 1, size: "M", unitPrice: 1 }],
      }),
    ).toBe(true)
  })
})

describe("toRpcParams", () => {
  it("maps the request onto the function's named arguments", () => {
    const parsed = orderRequestSchema.parse(validRequest)
    expect(toRpcParams(parsed)).toEqual({
      p_cart: [{ product_id: PRODUCT_A, quantity: 2, size: "M" }],
      p_customer_name: "Ade Okafor",
      p_customer_email: "ade@example.test",
      p_customer_phone: "0801 234 5678",
      p_delivery_address: "14 Adeniyi Jones Avenue",
      p_delivery_city: "Ikeja",
      p_delivery_state: "Lagos",
    })
  })

  it("carries no identity, money, status or order number", () => {
    const params = toRpcParams(orderRequestSchema.parse(validRequest)) as Record<string, unknown>

    // These are exactly the values the caller must never be able to choose.
    for (const forbidden of [
      "p_user_id",
      "p_unit_price",
      "p_line_total",
      "p_subtotal",
      "p_delivery_fee",
      "p_total",
      "p_status",
      "p_order_number",
      "p_stock_quantity",
      "user_id",
      "total",
    ]) {
      expect(Object.keys(params), forbidden).not.toContain(forbidden)
    }
  })

  it("passes each cart line through with the database's own key names", () => {
    const parsed = orderRequestSchema.parse({
      ...validRequest,
      cart: [
        { productId: PRODUCT_A, quantity: 2, size: "M" },
        { productId: PRODUCT_B, quantity: 1, size: "L" },
      ],
    })

    expect(toRpcParams(parsed).p_cart).toEqual([
      { product_id: PRODUCT_A, quantity: 2, size: "M" },
      { product_id: PRODUCT_B, quantity: 1, size: "L" },
    ])
  })
})