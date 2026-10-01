/**
 * Building a Mailgun request, with no network and no `server-only`.
 *
 * This half is deliberately separate from the transport that actually posts it
 * (`mailgun-transport.ts`). A module marked `server-only` throws the moment
 * anything outside a server component imports it — including a test — so the
 * parts worth asserting (the endpoint, the Basic-auth header, the exact form
 * fields, the key's absence from the body) live here where they can be.
 *
 * Credentials are read from the environment here but only ever end up in an
 * Authorization header, never in a rendered page, a log line or an API response.
 */

/** Regional API hosts. The US host is the default; EU is the other common one. */
const MAILGUN_API_HOSTS = [
  "https://api.mailgun.net",
  "https://api.eu.mailgun.net",
] as const

export type MailgunConfig = {
  apiKey: string
  domain: string
  fromEmail: string
  fromName: string
  /** Resolved once from the region so the request builder stays pure. */
  apiHost: string
}

export type MailgunMessage = {
  to: string
  subject: string
  text: string
  html: string
}

/**
 * Reads Mailgun configuration from an environment, or returns `null` when it is
 * not configured.
 *
 * `null` is a normal state, not an error: local development and CI have no
 * Mailgun credentials, and an unconfigured project should place orders perfectly
 * well — it just does not send the confirmation email.
 */
export function readMailgunConfig(
  env: Record<string, string | undefined> = process.env,
): MailgunConfig | null {
  const apiKey = env.MAILGUN_API_KEY?.trim()
  const domain = env.MAILGUN_DOMAIN?.trim()
  const fromEmail = env.MAILGUN_FROM_EMAIL?.trim()

  if (!apiKey || !domain || !fromEmail) return null

  // A base URL override would be a fifth variable to keep in step with the
  // dashboard; instead the domain's own region decides the host.
  const apiHost = /(^|\.)eu\.mailgun\./i.test(domain)
    ? MAILGUN_API_HOSTS[1]
    : MAILGUN_API_HOSTS[0]

  return {
    apiKey,
    domain,
    fromEmail,
    fromName: env.MAILGUN_FROM_NAME?.trim() || "North & Form",
    apiHost,
  }
}

/** A ready-to-send request. Pure: no network, no environment access. */
export type MailgunRequest = {
  url: string
  headers: Record<string, string>
  body: URLSearchParams
}

/**
 * Builds the HTTP request for one message.
 *
 * Mailgun takes HTTP Basic auth where the username is the literal string `api`
 * and the password is the API key. The reference address is quoted with a
 * display name, which is what puts "North & Form" in the customer's inbox.
 */
export function buildMailgunRequest(
  config: MailgunConfig,
  message: MailgunMessage,
): MailgunRequest {
  const body = new URLSearchParams({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })

  const credentials = Buffer.from(`api:${config.apiKey}`).toString("base64")

  return {
    url: `${config.apiHost}/v3/${encodeURIComponent(config.domain)}/messages`,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }
}