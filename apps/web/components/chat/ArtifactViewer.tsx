"use client"

import { X, Copy, Check, Download } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

export function ArtifactViewer() {
  const { activeArtifact, artifactViewerOpen, setArtifactViewerOpen } =
    useChatStore()
  const [copied, setCopied] = useState(false)

  if (!artifactViewerOpen || !activeArtifact) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeArtifact.content || "")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setArtifactViewerOpen(false)}
      />

      {/* Viewer */}
      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {activeArtifact.title}
            </h3>
            <span className="rounded bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium uppercase text-text-muted">
              {activeArtifact.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => setArtifactViewerOpen(false)}
              className="ml-1 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeArtifact.type === "code" ? (
            <pre className="p-6 font-mono text-xs leading-relaxed text-text-primary">
              <code>{activeArtifact.content}</code>
            </pre>
          ) : activeArtifact.type === "image" ? (
            <div className="flex h-full items-center justify-center p-6">
              {activeArtifact.url ? (
                <img
                  src={activeArtifact.url}
                  alt={activeArtifact.title}
                  className="max-h-full rounded-lg object-contain"
                />
              ) : (
                <span className="text-text-muted">Image preview unavailable</span>
              )}
            </div>
          ) : (
            <div className="p-6 text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
              {activeArtifact.content}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
