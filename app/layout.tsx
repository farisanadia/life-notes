import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Life Notes',
  description: 'Personal notes, synced across devices',
}

// CSP nonces require dynamic rendering — statically generated HTML has script
// tags without the per-request nonce, so the browser blocks every chunk.
export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // proxy.ts sets x-nonce per request; forward it to next-themes' inline
  // pre-paint script so CSP doesn't block it.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning  // required by next-themes to avoid mismatch on class attr
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
