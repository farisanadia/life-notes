'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"      // adds/removes 'dark' class on <html>
      defaultTheme="system"  // respects OS preference by default
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
