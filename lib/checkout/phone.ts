/**
 * Nigerian phone number validation.
 *
 * The rule is deliberately about *shape*, not formatting: people type Nigerian
 * numbers as `0801 234 5678`, `0801-234-5678`, `+234 801 234 5678` or
 * `(0801) 2345678`, and all of those are the same number. Requiring one
 * spelling would reject valid input for no benefit, so separators are stripped
 * before checking and a `+` country code is optional.
 *
 * What is rejected is a value that cannot be a Nigerian subscriber number:
 * random strings, numbers without a Nigerian trunk (`0`) or country (`234`)
 * code, and clearly short or long values.
 */

/** National format: `0` + 9–10 digits (e.g. `0801 234 5678`, `01 454 3981`). */
const NATIONAL_FORMAT = /^0\d{9,10}$/

/** International format: `234` + 9–10 digits, with or without a leading `+`. */
const INTERNATIONAL_FORMAT = /^234\d{9,10}$/

/**
 * Strips everything but digits, so formatting is ignored.
 *
 * A leading `+` is dropped along with separators; the remaining `234` prefix is
 * what identifies an international number, so the `+` carries no extra meaning.
 */
function toComparableDigits(value: string): string {
  return value.replace(/\D/g, "")
}

/** True when the value reads as a Nigerian phone number in any common format. */
export function isValidNigerianPhone(value: unknown): boolean {
  if (typeof value !== "string") return false

  const digits = toComparableDigits(value)
  return NATIONAL_FORMAT.test(digits) || INTERNATIONAL_FORMAT.test(digits)
}