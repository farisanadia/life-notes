import { NextResponse } from 'next/server'
import { clearLoginRateLimit } from '@/lib/rate-limit'

type Props = { params: Promise<{ ip: string }> }

export async function DELETE(req: Request, props: Props) {
  const adminKey    = process.env.ADMIN_API_KEY
  const providedKey = req.headers.get('x-admin-key')
  console.log('[rate-limit] adminKey set:', !!adminKey)
  console.log('[rate-limit] providedKey:', providedKey)
  console.log('[rate-limit] match:', adminKey === providedKey)

  if (!adminKey || providedKey !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ip } = await props.params
  const decoded = decodeURIComponent(ip)
  console.log('[rate-limit] clearing ip:', decoded)
  await clearLoginRateLimit(decoded)

  return NextResponse.json({ cleared: decoded })
}
