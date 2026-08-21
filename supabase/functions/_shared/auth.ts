// Shared auth gate for the edge functions.
//
// These functions hold the service role key, which bypasses RLS entirely. A
// weak check in here undoes every policy in the database at once, so the rules
// are strict:
//
//   1. NEVER trust a JWT you have not verified. Decoding the payload with
//      atob() and reading a claim out of it proves nothing: the payload is
//      base64, not a signature, and anyone can write whatever claims they like
//      into one. Use verifyUser(), which checks the token against the auth
//      server, or serviceRole(), which compares the raw key.
//   2. Deny by default. Every branch that does not explicitly allow must fall
//      through to a 403.

// deno-lint-ignore no-explicit-any
type Supabase = any

/** Constant time compare, so a wrong key cannot be found one byte at a time. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function bearerToken(req: Request): string {
  return (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
}

/**
 * True only when the caller presented the real service role key.
 *
 * This is the check that replaces reading `role: 'service_role'` out of an
 * unverified payload. It compares the token to the actual secret, so a forged
 * token cannot pass no matter what claims it carries.
 */
export function isServiceRole(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!key) return false
  return safeEqual(bearerToken(req), key)
}

export type Caller = { id: string; role: string | null }

/**
 * Verify the caller's JWT against the auth server and look up their role.
 * Returns null for anonymous, expired, forged, or unknown callers.
 */
export async function verifyUser(supabaseAdmin: Supabase, req: Request): Promise<Caller | null> {
  const token = bearerToken(req)
  if (!token) return null

  // The anon key is itself a valid signed JWT, so it would pass a naive
  // signature check. It has no user attached, so getUser rejects it.
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  const user = data?.user
  if (error || !user) return null

  const { data: prof } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()

  return { id: user.id, role: prof?.role ?? null }
}

/**
 * Allow the service role, or a signed-in user holding one of `roles`.
 * Pass roles: [] to accept any verified signed-in user.
 */
export async function requireRole(
  supabaseAdmin: Supabase,
  req: Request,
  roles: string[],
): Promise<Caller | null> {
  if (isServiceRole(req)) return { id: 'service_role', role: 'service_role' }
  const caller = await verifyUser(supabaseAdmin, req)
  if (!caller) return null
  if (roles.length === 0) return caller
  return caller.role && roles.includes(caller.role) ? caller : null
}

export function forbidden(headers: Record<string, string>, message = 'forbidden') {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
