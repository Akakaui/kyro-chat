"use client"

import React, { useEffect, useRef, useState } from "react"
import { Loader2, Monitor, RefreshCw, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

interface BrowserEmbedProps {
  taskId: string
  className?: string
  isHumanUsing?: boolean
}

export function BrowserEmbed({ taskId, className, isHumanUsing = false }: BrowserEmbedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting")
  const [statusText, setStatusText] = useState("Connecting to browser session...")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Attempt WebSocket connection to noVNC display
    const connectWs = () => {
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001"
        const ws = new WebSocket(`${wsUrl}/ws/browser/${taskId}`)

        ws.onopen = () => {
          setStatus("connected")
          setStatusText("Connected")
          wsRef.current = ws
        }

        ws.onerror = () => {
          setStatus("error")
          setStatusText("Failed to connect to browser session")
        }

        ws.onclose = () => {
          setStatus("error")
          setStatusText("Browser session ended")
        }
      } catch {
        setStatus("error")
        setStatusText("Unable to establish browser connection")
      }
    }

    connectWs()

    return () => {
      wsRef.current?.close()
    }
  }, [taskId])

  const handleRefresh = () => {
    setStatus("connecting")
    setStatusText("Reconnecting...")
    // Force re-render to trigger reconnect
  }

  return (
    <div className={cn("rounded-xl border border-border overflow-hidden bg-black", className)}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-text-muted" />
          <span className="text-xs font-medium text-text-primary">Browser</span>
          <span className="text-[10px] text-text-muted">Task {taskId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "connected" && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          )}
          {status === "error" && (
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
            >
              <RefreshCw size={10} />
              Retry
            </button>
          )}
          {isHumanUsing && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Taking over
            </span>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative aspect-video bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
        />
        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Loader2 size={24} className="text-accent animate-spin mb-2" />
            <span className="text-xs text-text-muted">{statusText}</span>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <AlertTriangle size={24} className="text-text-muted mb-2" />
            <span className="text-xs text-text-muted">{statusText}</span>
          </div>
        )}
      </div>
    </div>
  )
}
