import { describe, expect, it } from "vitest"

import { buildMailgunRequest, readMailgunConfig } from "@/lib/email/mailgun"

const config = {
  apiKey: "key-00000000000000000000000000000000",
  domain: "mg.example.ng",
  fromEmail: "orders@mg.example.ng",
  fromName: "North & Form",
  apiHost: "https://api.mailgun.net",
}

const message = {
  to: "ade@example.test",
  subject: "Order NF-1 received — payment pending",
  text: "plain text body",
  html: "<p>html body</p>",
}

describe("readMailgunConfig", () => {
  const complete = {
    MAILGUN_API_KEY: "key-abc",
    MAILGUN_DOMAIN: "mg.example.ng",
    MAILGUN_FROM_EMAIL: "orders@mg.example.ng",
    MAILGUN_FROM_NAME: "North & Form",
  }

  it("reads a complete configuration", () => {
    expect(readMailgunConfig(complete)).toEqual({
      apiKey: "key-abc",
      domain: "mg.example.ng",
      fromEmail: "orders@mg.example.ng",
      fromName: "North & Form",
      apiHost: "https://api.mailgun.net",
    })
  })

  it("returns null when nothing is configured", () => {
    expect(readMailgunConfig({})).toBeNull()
  })

  it("returns null when a required value is missing", () => {
    // MAILGUN_FROM_NAME is optional and has a default, so it is not in this list.
    for (const key of [
      "MAILGUN_API_KEY",
      "MAILGUN_DOMAIN",
      "MAILGUN_FROM_EMAIL",
    ]) {
      const partial = { ...complete, [key]: undefined }
      expect(readMailgunConfig(partial), key).toBeNull()
    }
  })

  it("treats blank values as missing", () => {
    expect(readMailgunConfig({ ...complete, MAILGUN_API_KEY: "   " })).toBeNull()
  })

  it("falls back to a default sender name", () => {
    expect(readMailgunConfig({ ...complete, MAILGUN_FROM_NAME: undefined })?.fromName).toBe(
      "North & Form",
    )
  })

  it("picks the EU host for an EU domain", () => {
    expect(
      readMailgunConfig({ ...complete, MAILGUN_DOMAIN: "mg.eu.mailgun.org" })?.apiHost,
    ).toBe("https://api.eu.mailgun.net")
  })

  it("uses the US host for a sandbox or US domain", () => {
    expect(
      readMailgunConfig({ ...complete, MAILGUN_DOMAIN: "sandbox123.mailgun.org" })?.apiHost,
    ).toBe("https://api.mailgun.net")
  })
})

describe("buildMailgunRequest", () => {
  const request = buildMailgunRequest(config, message)

  it("posts to the domain's messages endpoint", () => {
    expect(request.url).toBe(
      "https://api.mailgun.net/v3/mg.example.ng/messages",
    )
  })

  it("authenticates with HTTP Basic, the username literally 'api'", () => {
    const header = request.headers.Authorization
    expect(header.startsWith("Basic ")).toBe(true)

    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString()
    expect(decoded).toBe(`api:${config.apiKey}`)
  })

  it("sends a form-encoded body with every field Mailgun needs", () => {
    expect(request.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    )

    expect(request.body.get("from")).toBe("North & Form <orders@mg.example.ng>")
    expect(request.body.get("to")).toBe("ade@example.test")
    expect(request.body.get("subject")).toBe(message.subject)
    expect(request.body.get("text")).toBe("plain text body")
    expect(request.body.get("html")).toBe("<p>html body</p>")
  })

  it("puts the api key in the header only, never in the body", () => {
    // The body is logged and displayed by intermediaries; the key must not be in it.
    expect(request.body.toString()).not.toContain(config.apiKey)
  })

  it("percent-encodes the HTML body rather than pasting it raw", () => {
    // Form encoding is why the markup arrives intact instead of breaking the form.
    expect(request.body.toString()).toContain("%3Cp%3Ehtml")
  })
})