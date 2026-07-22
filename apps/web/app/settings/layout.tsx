"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  User,
  Moon,
  Plug,
  Bot,
  FolderKanban,
  BookOpen,
  Brain,
  ArrowLeft,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import * as React from "react"

const NAV_ITEMS = [
  { href: "/settings/profile", icon: User, label: "Profile" },
  { href: "/settings/appearance", icon: Moon, label: "Appearance" },
  { href: "/settings/agents", icon: Bot, label: "Agents" },
  { href: "/settings/projects", icon: FolderKanban, label: "Projects" },
  { href: "/settings/knowledge", icon: BookOpen, label: "Knowledge" },
  { href: "/settings/memory", icon: Brain, label: "Memory" },
  { href: "/settings/connectors", icon: Plug, label: "Connectors" },
]

function SettingsNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto p-3">
      <div className="space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
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
  )
}

function BackToChatLink() {
  return (
    <Link
      href="/chat"
      className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
    >
      <ArrowLeft size={16} />
      <span>Back to Chat</span>
    </Link>
  )
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-bg-secondary">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <BackToChatLink />
        </div>
        <SettingsNav />
      </aside>

      {/* Mobile header — shown only on mobile */}
      <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center border-b border-border bg-bg-primary px-3 md:hidden">
        <Link
          href="/chat"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="ml-2 text-sm font-medium text-text-primary">Settings</span>
        <div className="ml-auto">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                aria-label="Open settings menu"
              >
                <Menu size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Settings Navigation</SheetTitle>
              <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
                <BackToChatLink />
              </div>
              <SettingsNav onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 pb-20 pt-0 md:ml-60 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-10">{children}</div>
      </main>
    </div>
  )
}
