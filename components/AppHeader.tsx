import { ThemeToggle } from './ThemeToggle'
import { Logo } from './Logo'

interface Props {
  userName: string
}

export function AppHeader({ userName }: Props) {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Logo size={28} />
        <span className="text-sm font-semibold text-foreground">
          {userName}&apos;s notes
        </span>
      </div>
      <ThemeToggle />
    </header>
  )
}
