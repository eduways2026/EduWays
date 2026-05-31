// src/app/route.ts
// Serves landing.html as the homepage at "/"
// This is a Next.js Route Handler — returns raw HTML, no React needed
import { readFileSync } from 'fs'
import { join }         from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'landing.html'), 'utf-8')
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
