import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JobDiary - Voice-Powered Job Diary',
  description: 'A conversational job diary for tradies powered by voice',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}

