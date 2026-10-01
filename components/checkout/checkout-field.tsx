import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

/**
 * Label / control / message wrapper for the checkout form.
 *
 * Each control needs the same three things wired to the same id: a visible
 * label, an error that is announced and programmatically associated, and an
 * `aria-invalid` state. Repeating that wiring by hand across six fields is how
 * associations get dropped, so it lives here once.
 *
 * The control is supplied as a render function rather than through context or
 * element cloning, so the caller keeps full control of the element it renders.
 * Both wiring attributes are always provided:
 *
 * - `aria-labelledby` gives the control its accessible name. It is what makes
 *   the Base UI `<Select>` (a button, not an input) properly named; native
 *   inputs get the same correct name for free.
 * - `htmlFor` on the label still gives native inputs their click-to-focus.
 *
 * `role="alert"` on the error means a message that appears after a failed
 * submit is announced without stealing focus.
 */

/** Props the wrapper hands back to whichever control the caller renders. */
export type CheckoutControlProps = {
  id: string
  "aria-labelledby": string
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
}

type CheckoutFieldProps = {
  /** DOM id for the control. Every related id is derived from it. */
  id: string
  label: string
  /** Validation message. Present only when the field is invalid. */
  error?: string
  /** Optional always-on help text, described by the control. */
  hint?: string
  children: (control: CheckoutControlProps) => ReactNode
}

export function CheckoutField({
  id,
  label,
  error,
  hint,
  children,
}: CheckoutFieldProps) {
  const labelId = `${id}-label`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  const describedBy =
    [errorId, hintId].filter((value): value is string => value !== undefined).join(" ") ||
    undefined

  return (
    <div className="space-y-2">
      <Label htmlFor={id} id={labelId}>
        {label}
      </Label>

      {children({
        id,
        "aria-labelledby": labelId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm leading-relaxed text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}