"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  CreditCard,
  Zap,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

interface UsageStats {
  totalTokens: number
  totalCost: number
  periodTokens: number
  periodCost: number
  periodStart: string
  periodEnd: string
}

interface PlanInfo {
  name: string
  tokenLimit: number
  tokensUsed: number
  monthlyCost: number
  billingCycle: string
}

export function BillingSection() {
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const loadUsage = useCallback(async () => {
    try {
      const token = localStorage.getItem("auth_token")
      if (!token) return
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/billing/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUsage(data.usage)
        setPlan(data.plan)
      }
    } catch {
      // Silent fail - show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  const percentUsed = plan
    ? Math.min(100, (plan.tokensUsed / plan.tokenLimit) * 100)
    : 0

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="space-y-4">
      {/* Plan Overview */}
      <div className="p-4 bg-bg-secondary rounded-xl border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {plan?.name || "Free Plan"}
            </span>
          </div>
          <button
            className="flex items-center gap-1 text-xs text-accent hover:opacity-80"
          >
            Upgrade
            <ExternalLink size={10} />
          </button>
        </div>

        {/* Token Usage Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-[11px] text-text-muted mb-1">
            <span>Tokens used</span>
            <span>
              {plan ? `${formatTokens(plan.tokensUsed)} / ${formatTokens(plan.tokenLimit)}` : "—"}
            </span>
          </div>
          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                percentUsed >= 90 ? "bg-red-400" : percentUsed >= 70 ? "bg-amber-400" : "bg-accent"
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between text-[11px] text-text-muted">
          <span>Resets {plan?.billingCycle || "monthly"}</span>
          <span>
            {usage ? `$${usage.periodCost.toFixed(2)} this period` : "—"}
          </span>
        </div>
      </div>

      {/* Usage History Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary w-full"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BarChart3 size={14} />
        <span>Usage history</span>
      </button>

      {expanded && (
        <div className="p-4 bg-bg-secondary rounded-xl border border-border space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Total tokens (all time)</span>
            <span className="text-text-primary">{usage ? formatTokens(usage.totalTokens) : "—"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Total cost (all time)</span>
            <span className="text-text-primary">{usage ? `$${usage.totalCost.toFixed(2)}` : "—"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Period tokens</span>
            <span className="text-text-primary">{usage ? formatTokens(usage.periodTokens) : "—"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Period cost</span>
            <span className="text-text-primary">{usage ? `$${usage.periodCost.toFixed(2)}` : "—"}</span>
          </div>
          {usage?.periodStart && (
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Period</span>
              <span className="text-text-primary">
                {new Date(usage.periodStart).toLocaleDateString()} — {new Date(usage.periodEnd).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
