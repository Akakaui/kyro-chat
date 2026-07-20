"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolIndicatorProps {
  toolName: string
  source: "builtin" | "mcp" | "skill"
  mcpName?: string
  isLoading: boolean
  details?: string
  status?: "running" | "done" | "error"
}

export function ToolIndicator({
  toolName,
  source,
  mcpName,
  isLoading,
  details,
  status,
}: ToolIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  const resolvedStatus = status ?? (isLoading ? "running" : details ? "done" : "running")

  return (
    <div className="mt-1.5 inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors",
          "border border-border bg-bg-tertiary/80 backdrop-blur-sm",
          resolvedStatus === "running" && "text-accent border-accent/20",
          resolvedStatus === "done" && "text-success border-success/20",
          resolvedStatus === "error" && "text-danger border-danger/20",
          "hover:border-border-hover"
        )}
      >
        {/* Status icon */}
        {resolvedStatus === "running" ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
        ) : resolvedStatus === "done" ? (
          <Check size={11} className="shrink-0 text-success" />
        ) : (
          <X size={11} className="shrink-0 text-danger" />
        )}

        <span className="font-medium">{toolName}</span>

        {details && (
          <ChevronDown
            size={10}
            className={cn(
              "shrink-0 text-text-muted transition-transform",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Expanded details */}
      {expanded && details && (
        <div className="mt-1 rounded-lg border border-border bg-bg-primary/60 px-2.5 py-1.5 text-[10px] font-mono text-text-muted leading-relaxed backdrop-blur-sm">
          {details}
        </div>
      )}
    </div>
  )
}
