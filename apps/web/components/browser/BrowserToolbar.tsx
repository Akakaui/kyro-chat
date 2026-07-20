"use client"

import React, { useState, useCallback } from "react"
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Globe,
  Home,
  Layers,
  Plus,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface BrowserToolbarProps {
  url: string
  onNavigate: (url: string) => void
  onRefresh: () => void
  onBack: () => void
  onForward: () => void
  tabCount: number
  className?: string
}

export function BrowserToolbar({
  url,
  onNavigate,
  onRefresh,
  onBack,
  onForward,
  tabCount,
  className,
}: BrowserToolbarProps) {
  const [inputUrl, setInputUrl] = useState(url)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      let target = inputUrl.trim()
      if (!target) return
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        target = `https://${target}`
      }
      onNavigate(target)
    },
    [inputUrl, onNavigate]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputUrl(e.target.value)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit(e as any)
      }
    },
    [handleSubmit]
  )

  // Sync input when url prop changes externally
  React.useEffect(() => {
    setInputUrl(url)
  }, [url])

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-b border-border bg-bg-secondary px-3 py-2",
        className
      )}
    >
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        aria-label="Go back"
      >
        <ArrowLeft size={14} />
      </button>
      <button
        onClick={onForward}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        aria-label="Go forward"
      >
        <ArrowRight size={14} />
      </button>
      <button
        onClick={onRefresh}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        aria-label="Refresh"
      >
        <RefreshCw size={14} />
      </button>

      {/* URL input */}
      <form onSubmit={handleSubmit} className="flex-1">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 transition-colors focus-within:border-accent">
          <Globe size={12} className="shrink-0 text-text-muted" />
          <input
            type="text"
            value={inputUrl}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
            className="w-full bg-transparent text-xs text-text-secondary outline-none placeholder:text-text-muted"
            aria-label="Browser URL"
          />
        </div>
      </form>

      {/* Tab count */}
      <div className="flex items-center gap-1 rounded-md bg-bg-tertiary px-2 py-1 text-[10px] text-text-muted">
        <Layers size={10} />
        <span>{tabCount}</span>
      </div>
    </div>
  )
}
