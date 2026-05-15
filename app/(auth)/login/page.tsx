import { LoginForm } from './LoginForm'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Logo } from '@/components/Logo'

export const metadata = {
  title: 'Sign in — Life Notes',
}

export default function LoginPage() {
  return (
    <div className="dotted-board min-h-screen flex items-center justify-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="bg-surface rounded-xl shadow-sm border border-border p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <Logo size={48} />
          <h1 className="text-xl font-semibold text-foreground">Life Notes</h1>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
