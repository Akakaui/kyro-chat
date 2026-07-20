"use client"

import React, { useState, useCallback } from "react"
import { Shield, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface PermissionRequest {
  id: string
  toolName: string
  description: string
  args?: Record<string, unknown>
  source?: string
}

interface PermissionPromptProps {
  request: PermissionRequest
  onDecision: (id: string, decision: "allow" | "deny", remember: boolean) => void
  compact?: boolean
}

export function PermissionPrompt({
  request,
  onDecision,
  compact = false,
}: PermissionPromptProps) {
  const [expanded, setExpanded] = useState(false)
  const [remember, setRemember] = useState(false)

  const handleAllow = useCallback(() => {
    onDecision(request.id, "allow", remember)
  }, [request.id, remember, onDecision])

  const handleDeny = useCallback(() => {
    onDecision(request.id, "deny", remember)
  }, [request.id, remember, onDecision])

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
        <Shield size={14} className="shrink-0 text-accent" />
        <span className="flex-1 truncate text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{request.toolName}</span>
          {" wants to run"}
        </span>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-danger hover:bg-danger/10"
            onClick={handleDeny}
          >
            <X size={12} />
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-success text-white hover:bg-success/90"
            onClick={handleAllow}
          >
            <Check size={12} />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15">
          <Shield size={16} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-text-primary">
              Permission Required
            </h4>
            <span className="rounded-md bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {request.source || "builtin"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{request.toolName}</span>
            {" wants to execute. "}
            {request.description && (
              <span className="text-text-muted">{request.description}</span>
            )}
          </p>

          {/* Expandable args */}
          {request.args && Object.keys(request.args).length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {expanded ? "Hide details" : "Show details"}
              </button>
              {expanded && (
                <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-bg-primary p-2 text-[10px] text-text-secondary font-mono">
                  {JSON.stringify(request.args, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Remember toggle */}
          <label className="mt-2 flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3 w-3 rounded border-border accent-accent"
            />
            Remember this decision
          </label>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-danger hover:bg-danger/10"
          onClick={handleDeny}
        >
          <X size={14} className="mr-1" />
          Deny
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-success text-white hover:bg-success/90"
          onClick={handleAllow}
        >
          <Check size={14} className="mr-1" />
          Allow
        </Button>
      </div>
    </div>
  )
}
