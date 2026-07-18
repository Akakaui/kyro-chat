"use client"

import React, { useState } from "react"
import { Camera, Image, FileText, Globe, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

export function AddToChatOverlay() {
  const { addToChatOverlayOpen, setAddToChatOverlayOpen } = useChatStore()
  const [webSearch, setWebSearch] = useState(true)

  if (!addToChatOverlayOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setAddToChatOverlayOpen(false)}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-bg-secondary p-6 animate-in slide-in-from-bottom duration-250">
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

        {/* Title */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">
            Add to Chat
          </h3>
          <button
            onClick={() => setAddToChatOverlayOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="mb-6 flex justify-center gap-8">
          <ActionButton
            icon={<Camera size={22} />}
            label="Camera"
            onClick={() => setAddToChatOverlayOpen(false)}
          />
          <ActionButton
            icon={<Image size={22} />}
            label="Photo"
            onClick={() => setAddToChatOverlayOpen(false)}
          />
          <ActionButton
            icon={<FileText size={22} />}
            label="File"
            onClick={() => setAddToChatOverlayOpen(false)}
          />
        </div>

        {/* Divider */}
        <div className="mb-4 h-px bg-border" />

        {/* Web search toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-text-secondary" />
            <span className="text-sm text-text-primary">Web Search</span>
          </div>
          <button
            onClick={() => setWebSearch(!webSearch)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              webSearch ? "bg-accent" : "bg-bg-tertiary"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                webSearch ? "left-[18px]" : "left-0.5"
              )}
            />
          </button>
        </div>
      </div>
    </>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl px-4 py-3 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary">
        {icon}
      </div>
      <span className="text-xs">{label}</span>
    </button>
  )
}
