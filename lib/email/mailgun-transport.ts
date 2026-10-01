import "server-only"

import {
  buildMailgunRequest,
  readMailgunConfig,
  type MailgunConfig,
  type MailgunMessage,
} from "@/lib/email/mailgun"

/**
 * The Mailgun transport — the only thing in the app that talks to Mailgun.
 *
 * Mailgun's REST API is a single authenticated `POST` with a form-encoded body,
 * and Node has had a global `fetch` since 18, so this posts directly rather than
 * adding an SDK. The dependency list stays exactly as it was, which matters more
 * here than a client library's conveniences.
 *
 * Never throws. The caller is a notification step that runs *after* an order has
 * already been committed, so every outcome — unconfigured, refused, offline —
 * comes back as a value. Nothing here logs the API key, and the failure reason
 * is deliberately a short token rather than Mailgun's response body, which can
 * echo the recipient and the domain back.
 */

export type MailgunResult = { ok: true } | { ok: false; reason: string }

export async function sendMailgunMessage(
  message: MailgunMessage,
  options: { config?: MailgunConfig | null; timeoutMs?: number } = {},
): Promise<MailgunResult> {
  const config =
    options.config === undefined ? readMailgunConfig() : options.config

  if (!config) {
    return { ok: false, reason: "not-configured" }
  }

  const request = buildMailgunRequest(config, message)

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body.toString(),
      // Bounded so a hanging provider cannot hold the order response open.
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    })

    if (!response.ok) {
      return { ok: false, reason: `http-${response.status}` }
    }

    return { ok: true }
  } catch (cause) {
    return {
      ok: false,
      reason: `request-failed:${cause instanceof Error ? cause.name : "unknown"}`,
    }
  }
}