"use client"

import React from "react"
import { Monitor, Maximize2, Minimize2, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BrowserEmbedHeaderProps {
  isExpanded: boolean
  onToggle: () => void
  onClose?: () => void
  status: "connecting" | "connected" | "error"
  isHumanUsing?: boolean
}

export function BrowserEmbedHeader({
  isExpanded,
  onToggle,
  onClose,
  status,
  isHumanUsing = false,
}: BrowserEmbedHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border rounded-t-xl">
      <div className="flex items-center gap-2">
        <Monitor size={14} className="text-text-muted" />
        <span className="text-xs font-medium text-text-primary">Live Browser</span>
        {status === "connected" && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Live
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1 text-[10px] text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Disconnected
          </span>
        )}
        {isHumanUsing && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
            Human takeover
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
          title={isExpanded ? "Minimize" : "Maximize"}
        >
          {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-red-400 transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
