/**
 * Safe wrapper around `decodeURIComponent`. In Next.js 15 App Router,
 * `searchParams` are already URL-decoded, so calling decodeURIComponent on
 * them is a no-op IN MOST CASES — but if the value happens to contain a
 * literal "%" (e.g. "$ 0.03 (5%)"), decodeURIComponent throws "URI malformed".
 *
 * This helper returns the raw input on decode failure, eliminating the
 * landmine without changing the semantics for normal values.
 */
export function safeDecode(s: string | undefined | null): string {
  if (s === undefined || s === null) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
