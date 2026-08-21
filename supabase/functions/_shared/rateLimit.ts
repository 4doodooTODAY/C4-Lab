// Shared rate limiting for the public edge functions.
//
// Counters live in Postgres (see the rate_limits migration) because edge
// functions are stateless and spread across isolates, so an in-memory Map
// resets constantly and a bot just rides the resets.
//
// Identifiers are SHA-256 hashed before they leave here. We never want raw IP
// addresses or email addresses sitting in a table whose whole job is abuse
// prevention.

// deno-lint-ignore no-explicit-any
type Supabase = any

/** Best-effort client IP. Supabase sits behind a proxy, so trust the headers it sets. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  // Left-most entry is the original client; the rest are proxies.
  const first = fwd.split(',')[0].trim()
  return first || req.headers.get('cf-connecting-ip') || 'unknown'
}

export async function hashId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.toLowerCase().trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export type Limit = {
  bucket: string
  /** Raw value to count against, e.g. an IP or an email. Hashed before storage. */
  identifier: string
  max: number
  windowSeconds: number
}

/**
 * Returns true when every limit still has room. Counts a hit against each.
 *
 * Fails OPEN: if the database call itself errors, we let the request through
 * rather than taking the signup form down over a limiter problem. The limiter
 * is there to stop bots, not to become a new single point of failure.
 */
export async function withinLimits(supabase: Supabase, limits: Limit[]): Promise<boolean> {
  for (const limit of limits) {
    try {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_bucket: limit.bucket,
        p_identifier: await hashId(limit.identifier),
        p_max_hits: limit.max,
        p_window_seconds: limit.windowSeconds,
      })
      if (error) {
        console.error(`rate limit check failed (${limit.bucket}):`, error.message)
        continue
      }
      if (data === false) {
        console.warn(`rate limited: ${limit.bucket}`)
        return false
      }
    } catch (e) {
      console.error(`rate limit threw (${limit.bucket}):`, e)
    }
  }
  return true
}

/** 429 with a Retry-After, which is what well-behaved clients look for. */
export function tooManyRequests(headers: Record<string, string>, retryAfterSeconds = 3600) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  )
}
