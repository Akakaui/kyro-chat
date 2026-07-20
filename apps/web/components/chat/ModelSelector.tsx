"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, ChevronDown, Zap, Cpu, Clock, RefreshCw, Wifi, WifiOff, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { fetchModels, type Model, type ModelUsageWindow } from "@/lib/api"

interface ModelWithUsage extends Model {
  usage?: {
    used: number
    limit: number
    remaining: number
    percentUsed: number
    exhausted: boolean
  }
}

export function ModelSelector() {
  const {
    selectedModel,
    setSelectedModel,
    modelSelectorOpen,
    setModelSelectorOpen,
  } = useChatStore()

  const panelRef = useRef<HTMLDivElement>(null)
  const [models, setModels] = useState<ModelWithUsage[]>([])
  const [window, setWindow] = useState<ModelUsageWindow | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchModels()
      setModels(data.models)
      setWindow(data.window)
      // Auto-expand the selected model's provider
      const sel = data.models.find((m) => m.id === selectedModel.id)
      if (sel) setExpandedProvider(sel.provider)
    } catch (err) {
      console.error("Failed to load models:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedModel.id])

  useEffect(() => {
    if (modelSelectorOpen) {
      loadModels()
    }
  }, [modelSelectorOpen, loadModels])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setModelSelectorOpen(false)
      }
    }
    if (modelSelectorOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [modelSelectorOpen, setModelSelectorOpen])

  if (!modelSelectorOpen) return null

  // Group models by provider
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, ModelWithUsage[]>)

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={() => setModelSelectorOpen(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed bottom-20 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-bg-secondary shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Switch model</h3>
            {window && (
              <div className="flex items-center gap-1 rounded-md bg-bg-tertiary px-2 py-0.5">
                <Clock size={10} className="text-text-muted" />
                <span className="text-[10px] text-text-muted">
                  Refills in {formatTime(window.secondsUntilRefill)}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setModelSelectorOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Model list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-text-muted" />
            </div>
          ) : (
            Object.entries(modelsByProvider).map(([provider, providerModels]) => {
              const isExpanded = expandedProvider === provider
              return (
                <div key={provider} className="mb-1">
                  {/* Provider header */}
                  <button
                    onClick={() =>
                      setExpandedProvider(isExpanded ? null : provider)
                    }
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium uppercase text-text-muted transition-colors hover:bg-bg-hover"
                  >
                    <ChevronDown
                      size={12}
                      className={cn(
                        "transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                    {provider}
                    <span className="ml-auto text-[10px] normal-case text-text-muted">
                      {providerModels.length} models
                    </span>
                  </button>

                  {/* Provider models */}
                  {isExpanded &&
                    providerModels.map((model) => {
                      const isSelected = selectedModel.id === model.id
                      const isExhausted = model.usage?.exhausted
                      const percentUsed = model.usage?.percentUsed || 0

                      return (
                        <button
                          key={model.id}
                          onClick={() => {
                            if (model.available && !isExhausted) {
                              setSelectedModel(model)
                              setModelSelectorOpen(false)
                            }
                          }}
                          disabled={!model.available || isExhausted}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            isSelected
                              ? "bg-accent/10 text-accent"
                              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                            (!model.available || isExhausted) &&
                              "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {/* Icon */}
                          <div
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                              isSelected ? "bg-accent/20" : "bg-bg-tertiary"
                            )}
                          >
                            {model.tier === "fast" ? (
                              <Zap
                                size={14}
                                className={
                                  isSelected ? "text-accent" : "text-text-muted"
                                }
                              />
                            ) : (
                              <Cpu
                                size={14}
                                className={
                                  isSelected ? "text-accent" : "text-text-muted"
                                }
                              />
                            )}
                          </div>

                          {/* Name + usage */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {model.name}
                              </span>
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                  model.tier === "fast"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-blue-500/10 text-blue-400"
                                )}
                              >
                                {model.tier === "fast" ? "Fast" : "Pro"}
                              </span>
                              {isExhausted && (
                                <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                                  Exhausted
                                </span>
                              )}
                            </div>

                            {/* Usage bar */}
                            {model.usage && (
                              <div className="mt-1 flex items-center gap-2">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      isExhausted
                                        ? "bg-red-500"
                                        : percentUsed > 80
                                        ? "bg-amber-500"
                                        : "bg-accent"
                                    )}
                                    style={{
                                      width: `${Math.min(100, percentUsed)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-text-muted">
                                  {formatTokens(model.usage.used)} /{" "}
                                  {formatTokens(model.usage.limit)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Status */}
                          <div className="shrink-0">
                              {isSelected ? (
                              <Check size={12} className="text-white" />
                            ) : model.available ? (
                              <Wifi size={12} className="text-emerald-400" />
                            ) : (
                              <WifiOff size={12} className="text-text-muted" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
