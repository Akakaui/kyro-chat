"use client"

import React, { useRef, useEffect, useCallback } from "react"
import { Plus, Mic, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const {
    selectedModel,
    isStreaming,
    setAddToChatOverlayOpen,
    setModelSelectorOpen,
  } = useChatStore()

  const [value, setValue] = React.useState("")

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isStreaming) return
    window.dispatchEvent(
      new CustomEvent("kyro:send-message", { detail: { content: value.trim() } })
    )
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, isStreaming])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="safe-bottom border-t border-border bg-bg-primary px-3 py-3 md:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-bg-secondary p-2">
          {/* Plus button */}
          <button
            onClick={() => setAddToChatOverlayOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Plus size={18} />
          </button>

          {/* Model selector pill */}
          <button
            onClick={() => setModelSelectorOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {selectedModel.name}
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />

          {/* Mic button */}
          <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">
            <Mic size={18} />
          </button>

          {/* Send button */}
          <Button
            onClick={handleSubmit}
            disabled={!value.trim() || isStreaming}
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg",
              value.trim() && !isStreaming
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-bg-tertiary text-text-muted"
            )}
          >
            {isStreaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
