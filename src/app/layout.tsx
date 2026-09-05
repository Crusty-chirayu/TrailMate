import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import Navigation from '@/components/layout/Navigation'

// Self-hosted variable Inter (latin, wght 100-900). Served from our own
// bundle instead of fetched from Google Fonts at build time, so builds are
// deterministic and first load does not depend on a third-party CDN.
const inter = localFont({
  src: [
    {
      path: './fonts/Inter-Latin-wght-normal.woff2',
      weight: '100 900',
      style: 'normal',
    },
  ],
})

export const metadata: Metadata = {
  title: 'TrailMate - Outdoor Trip Planning & GPS Tracking',
  description: 'Plan your outdoor adventures, track GPS routes, and manage gear. Works offline too.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navigation />
        {children}
      </body>
    </html>
  )
}
