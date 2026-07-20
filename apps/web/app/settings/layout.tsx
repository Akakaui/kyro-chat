"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  User,
  Moon,
  Plug,
  ArrowLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/settings/profile", icon: User, label: "Profile" },
  { href: "/settings/appearance", icon: Moon, label: "Appearance" },
  { href: "/settings/connectors", icon: Plug, label: "Connectors" },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-bg-secondary">
        {/* Back to chat */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Link
            href="/chat"
            className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} />
            <span>Back to Chat</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/")
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  )}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-2xl px-6 py-10">{children}</div>
      </main>
    </div>
  )
}
