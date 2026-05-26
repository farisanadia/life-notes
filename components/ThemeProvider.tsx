'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"      // adds/removes 'dark' class on <html>
      defaultTheme="system"  // respects OS preference by default
      disableTransitionOnChange
      // Stamped onto the inline pre-paint theme script so it satisfies our
      // per-request CSP nonce instead of being blocked.
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
