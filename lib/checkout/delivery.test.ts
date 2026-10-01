import { describe, expect, it } from "vitest"

import {
  DELIVERY_FEES,
  getDeliveryFee,
  getDeliveryRegion,
} from "@/lib/checkout/delivery"
import { NIGERIAN_STATES } from "@/lib/checkout/nigeria-states"

describe("getDeliveryFee", () => {
  it("charges the Lagos rate for Lagos", () => {
    expect(getDeliveryFee("Lagos")).toBe(2000)
  })

  it("charges the Abuja rate for the Federal Capital Territory", () => {
    expect(getDeliveryFee("Federal Capital Territory")).toBe(2500)
  })

  it("charges the Port Harcourt rate for Rivers", () => {
    expect(getDeliveryFee("Rivers")).toBe(3000)
  })

  it("charges the standard rate for any other state", () => {
    expect(getDeliveryFee("Kano")).toBe(4000)
    expect(getDeliveryFee("Cross River")).toBe(4000)
    expect(getDeliveryFee("Oyo")).toBe(4000)
  })

  it("falls back to the standard rate when no state is chosen", () => {
    expect(getDeliveryFee(null)).toBe(4000)
    expect(getDeliveryFee(undefined)).toBe(4000)
    expect(getDeliveryFee("")).toBe(4000)
  })

  it("never returns a non-numeric fee, even for junk input", () => {
    // The value is user-controlled, so it must be total rather than throw.
    for (const value of ["constructor", "__proto__", "toString", "Lag0s", 0, false]) {
      expect(getDeliveryFee(value as unknown as string)).toBe(4000)
    }
  })

  it("prices every state in the canonical list", () => {
    for (const state of NIGERIAN_STATES) {
      expect(Number.isFinite(getDeliveryFee(state))).toBe(true)
      expect(getDeliveryFee(state)).toBeGreaterThan(0)
    }
  })
})

describe("getDeliveryRegion", () => {
  it("maps the two named states onto their delivery regions", () => {
    expect(getDeliveryRegion("Lagos")).toBe("Lagos")
    expect(getDeliveryRegion("Federal Capital Territory")).toBe("Abuja")
    expect(getDeliveryRegion("Rivers")).toBe("Port Harcourt")
  })

  it("groups every other state as other states", () => {
    expect(getDeliveryRegion("Kaduna")).toBe("Other states")
    expect(getDeliveryRegion(null)).toBe("Other states")
  })
})

describe("DELIVERY_FEES", () => {
  it("exposes one rate per region", () => {
    expect(DELIVERY_FEES).toEqual({
      Lagos: 2000,
      Abuja: 2500,
      "Port Harcourt": 3000,
      "Other states": 4000,
    })
  })
})