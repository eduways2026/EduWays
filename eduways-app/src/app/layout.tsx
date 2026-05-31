import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EduWays — Find Your Best Education Path',
  description: 'Compare every college path on Debt, Time, and Career ROI across all 50 states.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
