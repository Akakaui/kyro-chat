"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Globe,
  Minimize2,
  Monitor,
  User,
  Send,
  AlertCircle,
  Hand,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { BrowserToolbar } from "./BrowserToolbar"

interface Tab {
  id: string
  title: string
  url: string
  favIconUrl?: string
  active: boolean
}

interface BrowserOverlayProps {
  isOpen: boolean
  onClose: () => void
  sessionId?: string
  url?: string
  status?: "loading" | "active" | "idle"
}

export function BrowserOverlay({
  isOpen,
  onClose,
  sessionId,
  url: initialUrl = "",
  status = "idle",
}: BrowserOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [vncUrl, setVncUrl] = useState("")
  const [tabs, setTabs] = useState<Tab[]>([])
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [isConnected, setIsConnected] = useState(false)
  const [wasEverOpened, setWasEverOpened] = useState(false)

  const {
    humanInputRequired,
    setHumanInputRequired,
    browserSessionId,
    humanUsingBrowser,
    setHumanUsingBrowser,
  } = useChatStore()

  const activeSessionId = sessionId || browserSessionId

  // Fetch noVNC URL when session is available
  useEffect(() => {
    if (!activeSessionId || !isOpen) return

    const fetchVncUrl = async () => {
      try {
        const token = localStorage.getItem("token")
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/browser/vnc/${activeSessionId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        if (data.vncUrl) {
          setVncUrl(data.vncUrl)
        }
      } catch (err) {
        // Fallback URL
        setVncUrl(`http://localhost:6901/vnc.html?autoconnect=true&resize=scale&password=secret`)
      }
    }

    fetchVncUrl()
  }, [activeSessionId, isOpen])

  // Fetch tabs
  useEffect(() => {
    if (!activeSessionId || !isOpen) return

    const fetchTabs = async () => {
      try {
        const token = localStorage.getItem("token")
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/browser/tabs/${activeSessionId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await res.json()
        if (data.tabs) setTabs(data.tabs)
      } catch {
        // Ignore
      }
    }

    fetchTabs()
    const interval = setInterval(fetchTabs, 5000)
    return () => clearInterval(interval)
  }, [activeSessionId, isOpen])

  // Listen for human input SSE events
  useEffect(() => {
    if (!activeSessionId || !isOpen) return

    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/browser/human-input-stream/${activeSessionId}`
    )

    eventSource.addEventListener("human_input_required", (event) => {
      try {
        const data = JSON.parse(event.data)
        setHumanInputRequired({
          requestId: data.requestId,
          prompt: data.prompt,
        })
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [activeSessionId, isOpen, setHumanInputRequired])

  // Sync URL from props
  useEffect(() => {
    if (initialUrl && initialUrl !== currentUrl) {
      setCurrentUrl(initialUrl)
    }
  }, [initialUrl])

  // Auto-expand when isOpen becomes true; collapse when dismissed
  useEffect(() => {
    if (isOpen) {
      setIsExpanded(true)
      setWasEverOpened(true)
    }
  }, [isOpen])

  // Collapse handler — collapse instead of unmounting
  const handleDismiss = useCallback(() => {
    setIsExpanded(false)
    onClose()
  }, [onClose])

  // Don't render at all until we've been opened at least once
  if (!wasEverOpened && !isOpen) return null

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col rounded-2xl border border-border bg-bg-secondary shadow-2xl transition-all duration-300",
        isExpanded
          ? "inset-4 md:inset-8"
          : "bottom-24 right-4 h-[500px] w-[400px] md:bottom-28 md:right-8 md:w-[550px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
            <Monitor size={14} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Kyro&apos;s computer
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Live indicator */}
          {status === "active" && (
            <div className="flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 mr-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              <span className="text-[10px] font-medium text-success">Live</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDismiss}
            aria-label="Collapse browser"
          >
            <Minimize2 size={14} className="text-text-muted" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors max-w-[140px] truncate",
                tab.active
                  ? "bg-bg-hover text-text-primary font-medium"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-secondary"
              )}
              title={tab.title}
            >
              {tab.favIconUrl ? (
                <img
                  src={tab.favIconUrl}
                  alt=""
                  className="h-3 w-3 rounded-sm"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              ) : (
                <Globe size={10} className="shrink-0" />
              )}
              <span className="truncate">{tab.title || "New Tab"}</span>
            </button>
          ))}
        </div>
      )}

      {/* Browser toolbar */}
      <BrowserToolbar
        url={currentUrl}
        onNavigate={(url) => setCurrentUrl(url)}
        onRefresh={() => {}}
        onBack={() => {}}
        onForward={() => {}}
        tabCount={tabs.length || 1}
      />

      {/* Browser content — noVNC iframe */}
      <div className="relative flex-1 overflow-hidden bg-bg-primary">
        {vncUrl ? (
          <iframe
            src={vncUrl}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Kyro Browser"
          />
        ) : (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-text-muted">
            <Globe size={40} className="opacity-30" />
            <p className="text-xs">
              {status === "loading"
                ? "Starting browser..."
                : "Browser will appear when Kyro navigates"}
            </p>
          </div>
        )}

        {/* Status bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-border bg-bg-secondary/90 px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              humanUsingBrowser ? "bg-accent animate-pulse" : "bg-success"
            )} />
            <span className="text-[10px] font-medium text-text-muted">
              {humanUsingBrowser ? "You are using Browser" : "Kyro is using Browser"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 px-2 text-[10px] font-medium",
                humanUsingBrowser
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              )}
              onClick={() => setHumanUsingBrowser(!humanUsingBrowser)}
              title={humanUsingBrowser ? "Release control to agent" : "Take over browser control"}
            >
              <Hand size={10} />
              {humanUsingBrowser ? "Release" : "Take Over"}
            </Button>
            <span className="text-[10px] text-text-muted">
              {status === "active" ? "Connected" : status === "loading" ? "Loading..." : "Idle"}
            </span>
          </div>
        </div>
      </div>

      {/* Human input overlay — shown when agent needs user input */}
      {humanInputRequired && (
        <HumanInputOverlay
          requestId={humanInputRequired.requestId}
          prompt={humanInputRequired.prompt}
          onDismiss={() => setHumanInputRequired(null)}
        />
      )}
    </div>
  )
}

/* ─── Human Input Overlay ─── */
function HumanInputOverlay({
  requestId,
  prompt,
  onDismiss,
}: {
  requestId: string
  prompt: string
  onDismiss: () => void
}) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || submitting) return

    setSubmitting(true)
    try {
      const token = localStorage.getItem("token")
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/browser/wait-input`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ requestId, input: input.trim() }),
        }
      )
      setSubmitted(true)
      setTimeout(onDismiss, 1500)
    } catch (err) {
      // Handle error
    } finally {
      setSubmitting(false)
    }
  }, [input, requestId, submitting, onDismiss])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
              <Globe size={20} className="text-success" />
            </div>
            <p className="text-sm font-medium text-text-primary">Input submitted</p>
            <p className="text-xs text-text-muted">Kyro will continue with your input</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                <User size={20} className="text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Agent needs your input
                </h3>
                <p className="text-xs text-text-muted">
                  Kyro is waiting for you
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-bg-tertiary p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-accent" />
                <p className="text-xs text-text-secondary leading-relaxed">{prompt}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                }}
                placeholder="Type your response..."
                className="flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                aria-label="Your input"
              />
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!input.trim() || submitting}
              >
                {submitting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send size={14} />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
