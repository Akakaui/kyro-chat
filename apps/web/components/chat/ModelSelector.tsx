"use client"

import { useState, useRef, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { AVAILABLE_MODELS, type Model } from "@/lib/api"

export function ModelSelector() {
  const {
    selectedModel,
    setSelectedModel,
    modelSelectorOpen,
    setModelSelectorOpen,
  } = useChatStore()

  const panelRef = useRef<HTMLDivElement>(null)

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
        className="fixed bottom-20 left-1/2 z-50 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-bg-secondary shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Models</h3>
          <button
            onClick={() => setModelSelectorOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Model list */}
        <div className="max-h-64 overflow-y-auto p-2">
          {AVAILABLE_MODELS.map((model) => (
            <ModelItem
              key={model.id}
              model={model}
              selected={selectedModel.id === model.id}
              onSelect={() => {
                setSelectedModel(model)
                setModelSelectorOpen(false)
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function ModelItem({
  model,
  selected,
  onSelect,
}: {
  model: Model
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors",
        selected
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            model.available ? "bg-success" : "bg-text-muted"
          )}
        />
        <div>
          <div className="text-sm font-medium">{model.name}</div>
          <div className="text-xs text-text-muted">{model.provider}</div>
        </div>
      </div>
      <div className="text-xs text-text-muted">
        {model.price_per_million === 0
          ? "free"
          : `$${model.price_per_million}/M`}
      </div>
    </button>
  )
}
