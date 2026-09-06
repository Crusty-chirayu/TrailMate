import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import Navigation from '@/components/layout/Navigation'
import { PwaRegister } from '@/components/PwaRegister'

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
  applicationName: 'TrailMate',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'TrailMate',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
    shortcut: '/icons/icon-512.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
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
        <PwaRegister />
      </body>
    </html>
  )
}
