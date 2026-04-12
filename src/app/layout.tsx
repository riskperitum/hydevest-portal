import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Hydevest Portal', template: '%s | Hydevest Portal' },
  description: 'Hydevest business management portal.',
  robots: { index: false, follow: false },
  icons: { icon: '/logo/hydevest-logo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}