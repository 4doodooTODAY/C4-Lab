/**
 * Unit tests for the shared edge-function auth gate and rate limiter.
 *
 * These are the two modules every privileged edge function relies on to keep
 * the service-role key from being reachable by an unauthenticated caller, so
 * the tests lean on the "deny by default" behavior documented in auth.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bearerToken, isServiceRole, requireRole } from './auth.ts'
import { clientIp, hashId, withinLimits } from './rateLimit.ts'

function req(headers: Record<string, string> = {}) {
  return new Request('https://example.com', { headers })
}

// ── auth.ts ──────────────────────────────────────────────────────────────────

describe('bearerToken', () => {
  it('strips a case-insensitive "Bearer " prefix and trims the token, or returns "" when absent', () => {
    expect(bearerToken(req({ authorization: 'bearer   abc123  ' }))).toBe('abc123')
    expect(bearerToken(req({ authorization: 'Bearer xyz789' }))).toBe('xyz789')
    expect(bearerToken(req())).toBe('')
  })
})

describe('isServiceRole', () => {
  const REAL_KEY = 'real-service-role-key'

  beforeEach(() => {
    vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? REAL_KEY : undefined) } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns true only on an exact key match; false for a wrong token or an unset env key', () => {
    expect(isServiceRole(req({ authorization: `Bearer ${REAL_KEY}` }))).toBe(true)
    expect(isServiceRole(req({ authorization: 'Bearer not-the-key' }))).toBe(false)

    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    expect(isServiceRole(req({ authorization: `Bearer ${REAL_KEY}` }))).toBe(false)
  })
})

describe('requireRole', () => {
  const REAL_KEY = 'real-service-role-key'

  beforeEach(() => {
    vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? REAL_KEY : undefined) } })
  })

  afterEach(() => vi.unstubAllGlobals())

  function makeSupabase({ user = null, role = null } = {}) {
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : new Error('invalid') }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
      })),
    }
  }

  it('grants a service_role caller on key match, without consulting Supabase at all', async () => {
    const supabase = makeSupabase()
    const caller = await requireRole(supabase, req({ authorization: `Bearer ${REAL_KEY}` }), ['admin'])
    expect(caller).toEqual({ id: 'service_role', role: 'service_role' })
    expect(supabase.auth.getUser).not.toHaveBeenCalled()
  })

  it('returns null when there is no valid session and the caller is not service role', async () => {
    const supabase = makeSupabase({ user: null })
    const caller = await requireRole(supabase, req({ authorization: 'Bearer garbage' }), ['admin'])
    expect(caller).toBeNull()
  })

  it('accepts any verified user when roles is empty', async () => {
    const supabase = makeSupabase({ user: { id: 'user-1' }, role: 'client' })
    const caller = await requireRole(supabase, req({ authorization: 'Bearer valid-user-jwt' }), [])
    expect(caller).toEqual({ id: 'user-1', role: 'client' })
  })

  it('denies a verified user whose role is not in the allowed list', async () => {
    const supabase = makeSupabase({ user: { id: 'user-1' }, role: 'client' })
    const caller = await requireRole(supabase, req({ authorization: 'Bearer valid-user-jwt' }), ['admin', 'creative'])
    expect(caller).toBeNull()
  })
})

// ── rateLimit.ts ─────────────────────────────────────────────────────────────

describe('clientIp', () => {
  it('takes the left-most entry of x-forwarded-for, then falls back through cf-connecting-ip to "unknown"', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
    expect(clientIp(req({ 'cf-connecting-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIp(req())).toBe('unknown')
  })
})

describe('hashId', () => {
  it('produces a deterministic 32-char hex digest, normalized for case and whitespace', async () => {
    const a = await hashId('  Foo@Bar.com ')
    const b = await hashId('foo@bar.com')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('withinLimits', () => {
  it('returns true when every limit has room, false as soon as one is exceeded', async () => {
    const allOk = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) }
    expect(await withinLimits(allOk, [{ bucket: 'signup', identifier: '1.2.3.4', max: 5, windowSeconds: 60 }])).toBe(true)

    const oneExceeded = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: false, error: null }),
    }
    const ok = await withinLimits(oneExceeded, [
      { bucket: 'ip', identifier: '1.2.3.4', max: 5, windowSeconds: 60 },
      { bucket: 'email', identifier: 'a@b.com', max: 1, windowSeconds: 60 },
    ])
    expect(ok).toBe(false)
  })

  it('fails open (returns true) when the limiter RPC errors or throws', async () => {
    const errored = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('db down') }) }
    expect(await withinLimits(errored, [{ bucket: 'ip', identifier: 'x', max: 1, windowSeconds: 60 }])).toBe(true)

    const threw = { rpc: vi.fn().mockRejectedValue(new Error('boom')) }
    expect(await withinLimits(threw, [{ bucket: 'ip', identifier: 'x', max: 1, windowSeconds: 60 }])).toBe(true)
  })
})
