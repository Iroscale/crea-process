/**
 * Format raw API error messages for display in the UI.
 * Detects common patterns (rate limit, auth, network) and returns a short
 * human-friendly French message instead of dumping JSON or stack traces.
 */
export function formatGenError(raw: string | null | undefined): string {
  if (!raw) return "Échec";
  const s = String(raw);

  // Gemini rate limit
  if (/\b429\b|RESOURCE_EXHAUSTED|Quota exceeded|generate_requests_per_model/i.test(s)) {
    const delayMatch = s.match(/retryDelay["']?\s*:\s*["'](\d+(?:\.\d+)?)s["']/i);
    const delay = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) : null;
    return delay
      ? `Quota Gemini · réessaie dans ${delay}s`
      : `Quota Gemini · réessaie dans 1-2 min`;
  }

  // Auth / billing
  if (/\b401\b|UNAUTHENTICATED|invalid API key|API key not valid/i.test(s)) {
    return "Erreur authentification API — vérifie la clé";
  }
  if (/\b403\b|PERMISSION_DENIED|billing|payment/i.test(s)) {
    return "Quota / billing — vérifie ton compte API";
  }

  // Timeout / network
  if (/timeout|ETIMEDOUT|ENETUNREACH|ECONNRESET/i.test(s)) {
    return "Timeout réseau — réessaie";
  }

  // Server / 5xx
  if (/\b5\d\d\b|INTERNAL|SERVICE_UNAVAILABLE/i.test(s)) {
    return "Erreur serveur API — réessaie";
  }

  // Default — truncate generic message to 120 chars (avoid dumping JSON)
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
