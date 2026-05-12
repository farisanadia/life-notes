import { LoginForm } from './LoginForm'
import { ThemeToggle } from '@/components/ThemeToggle'

export const metadata = {
  title: 'Sign in — Life Notes',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="bg-surface rounded-xl shadow-sm border border-border p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-6 text-foreground">Life Notes</h1>
        <LoginForm />
      </div>
    </div>
  )
}
