import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "../styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Kyro",
  description: "AI-powered agentic assistant",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ background: "#121212" }}>
      <body
        className={`${inter.variable} ${inter.className} antialiased`}
        style={{ background: "#121212", color: "#ececec", height: "100%" }}
      >
        {children}
      </body>
    </html>
  )
}

