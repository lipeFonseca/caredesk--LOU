import test from 'node:test'
import assert from 'node:assert/strict'

import { signAccessToken, authMiddleware, adminOnly, readCookie } from '../src/middleware/auth.js'

const SECRET = 'test-secret'

function makeContext(authHeader, cookieHeader) {
  const store = {}
  return {
    req: { header: (name) => {
      if (name === 'Authorization') return authHeader
      if (name === 'Cookie') return cookieHeader
      return undefined
    } },
    env: { JWT_SECRET: SECRET },
    set: (key, value) => { store[key] = value },
    get: (key) => store[key],
    json: (body, status) => ({ body, status }),
  }
}

async function callMiddleware(middleware, c) {
  let nextCalled = false
  const result = await middleware(c, async () => { nextCalled = true })
  return { result, nextCalled }
}

// ── signAccessToken / authMiddleware round-trip ────────────────

test('signAccessToken produces a 3-part JWT with the expected claims', async () => {
  const token = await signAccessToken({ sub: 'agent-1', role: 'admin' }, SECRET)
  const parts = token.split('.')
  assert.equal(parts.length, 3)

  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  assert.equal(payload.sub, 'agent-1')
  assert.equal(payload.role, 'admin')
  assert.equal(payload.exp - payload.iat, 15 * 60)
})

test('authMiddleware accepts a valid token via the access_token cookie', async () => {
  const token = await signAccessToken({ sub: 'agent-1', role: 'agent' }, SECRET)
  const c = makeContext(undefined, `access_token=${token}; other=1`)

  const { nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, true)
  assert.equal(c.get('agent').sub, 'agent-1')
})

test('readCookie extracts a named cookie from a raw Cookie header', () => {
  assert.equal(readCookie('a=1; access_token=abc; b=2', 'access_token'), 'abc')
  assert.equal(readCookie(undefined, 'access_token'), null)
  assert.equal(readCookie('a=1', 'access_token'), null)
})

test('authMiddleware accepts a valid token and exposes the payload via c.get("agent")', async () => {
  const token = await signAccessToken({ sub: 'agent-1', role: 'agent' }, SECRET)
  const c = makeContext(`Bearer ${token}`)

  const { nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, true)
  assert.equal(c.get('agent').sub, 'agent-1')
})

test('authMiddleware rejects a missing Authorization header', async () => {
  const c = makeContext(undefined)
  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

test('authMiddleware rejects a header without the Bearer scheme', async () => {
  const c = makeContext('Token abcdef')
  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

test('authMiddleware rejects a malformed token', async () => {
  const c = makeContext('Bearer not-a-jwt')
  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

test('authMiddleware rejects a token signed with a different secret', async () => {
  const token = await signAccessToken({ sub: 'agent-1' }, 'wrong-secret')
  const c = makeContext(`Bearer ${token}`)
  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

test('authMiddleware rejects a token with a tampered signature', async () => {
  const token = await signAccessToken({ sub: 'agent-1' }, SECRET)
  const [header, payload, signature] = token.split('.')
  const tamperedSignature = signature.slice(0, -1) + (signature.at(-1) === 'A' ? 'B' : 'A')
  const c = makeContext(`Bearer ${header}.${payload}.${tamperedSignature}`)

  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

test('authMiddleware rejects an expired token', async () => {
  const expiredToken = await signExpiredToken({ sub: 'agent-1' }, SECRET)
  const c = makeContext(`Bearer ${expiredToken}`)

  const { result, nextCalled } = await callMiddleware(authMiddleware, c)

  assert.equal(nextCalled, false)
  assert.equal(result.status, 401)
})

// ── adminOnly ────────────────────────────────────────────────

test('adminOnly allows agents with the admin role', async () => {
  const c = makeContext(undefined)
  c.set('agent', { role: 'admin' })

  const { nextCalled } = await callMiddleware(adminOnly, c)
  assert.equal(nextCalled, true)
})

test('adminOnly rejects non-admin agents', async () => {
  const c = makeContext(undefined)
  c.set('agent', { role: 'agent' })

  const { result, nextCalled } = await callMiddleware(adminOnly, c)
  assert.equal(nextCalled, false)
  assert.equal(result.status, 403)
})

// ── Helper: builds an already-expired JWT using the same signing
// scheme as middleware/auth.js, to exercise the expiry check. ──
async function signExpiredToken(payload, secret) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const claims = { ...payload, iat: now - 1000, exp: now - 1 }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(claims))
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = await signHmac(data, secret)
  return `${data}.${signature}`
}

async function signHmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncodeBytes(new Uint8Array(signature))
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value))
}

function base64UrlEncodeBytes(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return Buffer.from(binary, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
