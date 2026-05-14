import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isDev = process.env.NODE_ENV === 'development'

function buildCsp(nonce: string) {
  // img-src 'self' data: blob: — blocks every external image, killing
  // tracking pixels and intranet probes (`<img src="http://192.168...">`)
  // hidden in user-pasted markdown.
  //
  // script-src nonce+strict-dynamic — only scripts Next.js emits with the
  // matching nonce can run. 'unsafe-eval' is required in dev for React's
  // error overlay; production runs without it.
  //
  // style-src 'unsafe-inline' — CodeMirror/Tailwind use inline style
  // attributes pervasively; nonces don't cover style="" attributes anyway.
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const session = await auth()
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/rate-limit')

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/notes', request.url))
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  )
  // HSTS only in production — dev runs on http://localhost where HSTS
  // would lock the browser into refusing http for a year.
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
  }
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
