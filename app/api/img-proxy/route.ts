import { NextResponse } from 'next/server'
import { lookup as dnsLookupCb } from 'node:dns'
import { isIP } from 'node:net'
import type { LookupFunction } from 'node:net'
import type { LookupAddress } from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'
import { auth } from '@/lib/auth'
import { isPrivateIp } from '@/lib/ssrf'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 8000

// Only allow standard web ports. Anything else (smtp/25, ssh/22, redis/6379,
// elasticsearch/9200, etc.) is almost certainly an attempt to use the proxy
// as a port scanner against the public internet via attacker-controlled DNS.
const ALLOWED_PORTS = new Set(['', '80', '443'])

// Undici's connect.lookup follows the standard Node `dns.lookup` contract:
// callers may pass options.all=true (expects an array) or omit it (expects a
// single address). We have to honour whichever they ask for, or the connect
// layer dies with "Invalid IP address: undefined".
const safeLookup: LookupFunction = (hostname, opts, cb) => {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) return cb(new Error('SSRF: private IP') as NodeJS.ErrnoException, '', 0)
    return cb(null, hostname, isIP(hostname))
  }
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) {
    return cb(new Error('SSRF: localhost') as NodeJS.ErrnoException, '', 0)
  }
  // Resolve every address first so we can reject if *any* points into a
  // blocked range — fetch() then uses the same data, closing the DNS-
  // rebinding TOCTOU window.
  dnsLookupCb(hostname, { all: true, family: opts?.family ?? 0 }, (err, addresses) => {
    if (err) return cb(err, '', 0)
    const all = (addresses as LookupAddress[]) ?? []
    const bad = all.find(a => isPrivateIp(a.address))
    if (bad) return cb(new Error(`SSRF: ${bad.address}`) as NodeJS.ErrnoException, '', 0)
    if (all.length === 0) return cb(new Error('No DNS results') as NodeJS.ErrnoException, '', 0)
    if (opts?.all) {
      ;(cb as unknown as (e: null, addrs: LookupAddress[]) => void)(null, all)
    } else {
      const pick = all[0]
      cb(null, pick.address, pick.family)
    }
  })
}

const safeAgent = new Agent({
  connect: { lookup: safeLookup },
  bodyTimeout: TIMEOUT_MS,
  headersTimeout: TIMEOUT_MS,
})

export async function GET(request: Request) {
  const session = await auth()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const raw = new URL(request.url).searchParams.get('url')
  if (!raw) return new NextResponse('Missing url', { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new NextResponse('Bad url', { status: 400 })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return new NextResponse('Unsupported scheme', { status: 400 })
  }
  if (!ALLOWED_PORTS.has(target.port)) {
    return new NextResponse('Port not allowed', { status: 400 })
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)

  try {
    const upstream = await undiciFetch(target, {
      signal: ac.signal,
      dispatcher: safeAgent,
      redirect: 'follow',
      // No cookies, no referer, no user creds — strip everything identifying.
      // Mozilla-compatible UA: Wikimedia and some CDNs 400 on bare bot UAs,
      // and the user gains nothing from us announcing ourselves to them.
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LifeNotes-ImgProxy/1.0)',
        accept: 'image/*,*/*;q=0.8',
      },
    })

    if (!upstream.ok) {
      console.error('[img-proxy] upstream non-ok', target.href, upstream.status)
      return new NextResponse(`Upstream ${upstream.status}`, { status: 502 })
    }

    const ct = upstream.headers.get('content-type') ?? ''
    if (!ct.toLowerCase().startsWith('image/')) {
      console.error('[img-proxy] bad content-type', target.href, ct)
      return new NextResponse('Not an image', { status: 415 })
    }

    const len = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(len) && len > MAX_BYTES) {
      return new NextResponse('Too large', { status: 413 })
    }

    const reader = upstream.body?.getReader()
    if (!reader) return new NextResponse('No body', { status: 502 })

    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        ac.abort()
        return new NextResponse('Too large', { status: 413 })
      }
      chunks.push(value)
    }

    const body = Buffer.concat(chunks)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': ct,
        'content-length': String(body.byteLength),
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[img-proxy] fetch threw', target.href, err)
    return new NextResponse('Fetch failed', { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
