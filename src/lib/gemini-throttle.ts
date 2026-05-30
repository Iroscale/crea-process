/**
 * Throttle + auto-retry for Gemini image API calls.
 *
 * Why : Google enforces 20 requests-per-minute per model on the
 * `gemini-3-pro-image` endpoint. When we generate a brief matrix (e.g.
 * 6 angles × 3 concepts × 2 models = 36 parallel calls), we burst past
 * the cap and get HTTP 429 RESOURCE_EXHAUSTED. The API even tells us how
 * long to wait via `retryDelay: 15s`.
 *
 * Strategy :
 *  1. Sliding-window throttle at 15 RPM (under the 20 cap, with margin)
 *     — incoming calls wait until a slot is free
 *  2. On 429, parse retryDelay from the error message, sleep, retry
 *     — up to MAX_RETRIES attempts
 */

const RPM_LIMIT = 15; // safe margin under Google's 20 RPM cap
const WINDOW_MS = 60_000;
const MAX_RETRIES = 4;
const DEFAULT_RETRY_SEC = 30;

/**
 * How long ONE individual call is allowed to spend queued up before giving up.
 * With 15 RPM, a 30-minute cap means the queue can hold ~450 pending calls
 * worth of throughput before the oldest abandons — way more than any
 * realistic batch. Override with GEMINI_THROTTLE_MAX_WAIT_MIN env if you want
 * a different cap (in minutes).
 */
const MAX_TOTAL_WAIT_MS =
  (parseInt(process.env.GEMINI_THROTTLE_MAX_WAIT_MIN ?? "30", 10) || 30) *
  60_000;

// In-memory sliding window. Process-local — fine for a single Next.js server
// instance. If we ever scale horizontally, swap for Redis-backed throttle.
const callTimes: number[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(): Promise<void> {
  // Loop until we can take a slot. Each iteration : prune old timestamps,
  // either reserve a slot or sleep until the oldest expires.
  //
  // Bounded by MAX_TOTAL_WAIT_MS. The cap is generous (30 min default) so
  // huge batches (60+ images) finish, but it still bails out on truly
  // pathological queues (something stuck holding slots).
  const startedAt = Date.now();

  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_TOTAL_WAIT_MS) {
      const minutes = Math.round(MAX_TOTAL_WAIT_MS / 60_000);
      throw new Error(
        `Gemini throttle : waited > ${minutes} min for a slot, abandoning. ` +
          `Augmente GEMINI_THROTTLE_MAX_WAIT_MIN ou réduis la taille du batch.`
      );
    }
    const now = Date.now();
    // Remove timestamps older than the window
    while (callTimes.length > 0 && now - callTimes[0] > WINDOW_MS) {
      callTimes.shift();
    }
    if (callTimes.length < RPM_LIMIT) {
      callTimes.push(now);
      return;
    }
    // Wait until the oldest timestamp is out of window (with 100ms buffer).
    // Cap each individual wait at 5s so we revisit the prune logic frequently
    // — keeps the queue draining smoothly when many callers wake at once.
    const waitMs = Math.min(
      WINDOW_MS - (now - callTimes[0]) + 100,
      5_000
    );
    await sleep(waitMs);
  }
}

function parseRetryDelay(msg: string): number {
  // Google returns delays like  retryDelay: "15s"  or  retryDelay":"15.5s"
  const m = msg.match(/retryDelay["']?\s*:\s*["'](\d+(?:\.\d+)?)s["']/i);
  if (m) return Math.min(120, parseFloat(m[1]));
  return DEFAULT_RETRY_SEC;
}

function isRateLimitError(msg: string): boolean {
  return /\b429\b|RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg);
}

/**
 * Wrap a Gemini API call with throttling + 429-retry. The call is held until
 * a rate-limit slot is available, then made. On 429 we honour Google's
 * suggested retryDelay and try again (up to MAX_RETRIES additional attempts).
 *
 * Other errors (auth, bad model, etc.) are re-thrown as-is — no point retrying.
 */
export async function callGeminiWithThrottleAndRetry<T>(
  fn: () => Promise<T>
): Promise<T> {
  await acquireSlot();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message ?? "";
      if (isRateLimitError(msg) && attempt < MAX_RETRIES) {
        const retrySec = parseRetryDelay(msg);
        const jitterMs = Math.floor(Math.random() * 1000);
        await sleep(retrySec * 1000 + jitterMs);
        await acquireSlot();
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("Gemini call failed after retries");
}

/**
 * Best-effort detection — used by callers that want to surface a friendly
 * "rate limit, réessaie" message instead of dumping the raw JSON in the UI.
 */
export function isRateLimitMessage(msg: string): boolean {
  return isRateLimitError(msg);
}
