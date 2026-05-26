import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// Mock undici so the route never makes real network calls. Each test
// configures `mockFetch` to return either a synthetic Response, throw, or
// stay unset (the default mock just throws "no upstream").
const mockFetch = vi.fn()
vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: (...args: unknown[]) => mockFetch(...args) }
})

import { auth } from '@/lib/auth'
import { GET } from '@/app/api/img-proxy/route'

const mockAuth = vi.mocked(auth)

function authed() {
  mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'tester' } } as any)
}
function unauthed() {
  mockAuth.mockResolvedValue(null as any)
}

function req(url: string) {
  return new Request(`http://localhost:3000/api/img-proxy${url}`)
}

// Build a synthetic upstream Response with a single-chunk body. The route
// reads bytes via `body.getReader()`, and the global Response gives us that
// for free.
function fakeUpstream({
  status = 200,
  contentType = 'image/png',
  body = new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  contentLength,
}: {
  status?: number
  contentType?: string
  body?: Uint8Array
  contentLength?: string
}) {
  const headers = new Headers({ 'content-type': contentType })
  if (contentLength) headers.set('content-length', contentLength)
  return new Response(body as BodyInit, { status, headers })
}

describe('GET /api/img-proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('auth gate', () => {
    it('returns 401 when no session', async () => {
      unauthed()
      const res = await GET(req('?url=https://example.com/x.png'))
      expect(res.status).toBe(401)
      expect(await res.text()).toBe('Unauthorized')
    })

    it('does NOT call upstream when unauthenticated', async () => {
      unauthed()
      await GET(req('?url=https://example.com/x.png'))
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('URL validation (authenticated)', () => {
    beforeEach(authed)

    it('rejects missing url param with 400', async () => {
      const res = await GET(req(''))
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Missing url')
    })

    it('rejects unparseable url with 400', async () => {
      const res = await GET(req('?url=not%20a%20url'))
      expect(res.status).toBe(400)
    })

    it('rejects file:// scheme', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('file:///etc/passwd')))
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Unsupported scheme')
    })

    it('rejects javascript: scheme', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('javascript:alert(1)')))
      expect(res.status).toBe(400)
    })

    it('rejects gopher: scheme — classic SSRF pivot', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('gopher://example.com/_test')))
      expect(res.status).toBe(400)
    })

    it('rejects ftp: scheme', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('ftp://example.com/file')))
      expect(res.status).toBe(400)
    })

    it('rejects port 22 (ssh)', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com:22/x')))
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Port not allowed')
    })

    it('rejects port 6379 (redis)', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com:6379/x')))
      expect(res.status).toBe(400)
    })

    it('rejects port 9200 (elasticsearch)', async () => {
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com:9200/x')))
      expect(res.status).toBe(400)
    })

    it('does NOT call upstream when validation fails', async () => {
      await GET(req('?url=' + encodeURIComponent('javascript:alert(1)')))
      await GET(req('?url=' + encodeURIComponent('https://example.com:22/x')))
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('allows standard https with implicit port 443', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/x.png')))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(200)
    })

    it('allows explicit standard port 443', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com:443/x.png')))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(200)
    })

    it('allows explicit standard port 80', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      const res = await GET(req('?url=' + encodeURIComponent('http://example.com/x.png')))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(200)
    })
  })

  describe('upstream response handling', () => {
    beforeEach(authed)

    it('rejects non-image content-type with 415', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({ contentType: 'text/html' }))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/page.html')))
      expect(res.status).toBe(415)
      expect(await res.text()).toBe('Not an image')
    })

    it('rejects content-type that lies about being image/* (e.g. text/html; image)', async () => {
      // Strict prefix match: we only accept content-type starting with "image/".
      mockFetch.mockResolvedValue(fakeUpstream({ contentType: 'text/html; image/png' }))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/x')))
      expect(res.status).toBe(415)
    })

    it('rejects when upstream returns non-2xx (502 bad gateway)', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({ status: 404, contentType: 'image/png' }))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/missing.png')))
      expect(res.status).toBe(502)
    })

    it('rejects oversized response via content-length header', async () => {
      mockFetch.mockResolvedValue(
        fakeUpstream({ contentType: 'image/png', contentLength: String(11 * 1024 * 1024) }),
      )
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/huge.png')))
      expect(res.status).toBe(413)
    })

    it('rejects oversized response that lies about content-length but streams huge body', async () => {
      const big = new Uint8Array(11 * 1024 * 1024)
      mockFetch.mockResolvedValue(fakeUpstream({ contentType: 'image/png', body: big }))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/huge.png')))
      expect(res.status).toBe(413)
    })

    it('returns 502 if fetch itself throws (e.g. SSRF lookup rejected)', async () => {
      mockFetch.mockRejectedValue(new Error('SSRF: 192.168.1.1'))
      const res = await GET(req('?url=' + encodeURIComponent('https://internal.example.com/x')))
      expect(res.status).toBe(502)
    })

    it('passes through image bytes on success with cache and nosniff headers', async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      mockFetch.mockResolvedValue(fakeUpstream({ contentType: 'image/png', body: bytes }))
      const res = await GET(req('?url=' + encodeURIComponent('https://example.com/x.png')))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('cache-control')).toContain('immutable')
      const got = new Uint8Array(await res.arrayBuffer())
      expect(Array.from(got)).toEqual(Array.from(bytes))
    })
  })

  describe('outbound request shape — confirms no client info leaks', () => {
    beforeEach(authed)

    it('does not forward cookies, referer, or authorization to upstream', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      const incoming = new Request('http://localhost:3000/api/img-proxy?url=' +
        encodeURIComponent('https://example.com/x.png'), {
          headers: {
            cookie: 'session=secret-token',
            referer: 'http://localhost:3000/notes/sensitive',
            authorization: 'Bearer leaked',
          },
        })
      await GET(incoming)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0]!
      const outHeaders = (init as { headers: Record<string, string> }).headers
      const keys = Object.keys(outHeaders).map(k => k.toLowerCase())
      expect(keys).not.toContain('cookie')
      expect(keys).not.toContain('referer')
      expect(keys).not.toContain('authorization')
    })

    it('sets a Mozilla-compatible UA (some CDNs reject bare bot UAs)', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      await GET(req('?url=' + encodeURIComponent('https://example.com/x.png')))
      const [, init] = mockFetch.mock.calls[0]!
      const headers = (init as { headers: Record<string, string> }).headers
      expect(headers['user-agent']).toMatch(/Mozilla\/5\.0/)
    })

    it('uses the SSRF-safe undici dispatcher', async () => {
      mockFetch.mockResolvedValue(fakeUpstream({}))
      await GET(req('?url=' + encodeURIComponent('https://example.com/x.png')))
      const [, init] = mockFetch.mock.calls[0]!
      const d = (init as { dispatcher?: unknown }).dispatcher
      expect(d).toBeDefined()
    })
  })
})
