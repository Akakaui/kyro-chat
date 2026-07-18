"use client"

import { FileCode, FileText, Image, X, Globe, Code } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

const artifactIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  code: FileCode,
  document: FileText,
  image: Image,
  html: Globe,
  react: Code,
  markdown: FileText,
}

export function ArtifactQueue() {
  const { artifacts, artifactQueueOpen, setArtifactQueueOpen, setActiveArtifact, setArtifactViewerOpen } = useChatStore()

  if (!artifactQueueOpen || artifacts.length === 0) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setArtifactQueueOpen(false)}
      />

      {/* Queue panel */}
      <div className="fixed right-4 top-20 z-50 w-72 rounded-2xl border border-border bg-bg-secondary shadow-xl animate-in fade-in slide-in-from-right-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Artifacts ({artifacts.length})
          </h3>
          <button
            onClick={() => setArtifactQueueOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto p-2">
          {artifacts.map((artifact) => {
            const Icon = artifactIcons[artifact.type] || FileText
            return (
              <button
                key={artifact.id}
                onClick={() => {
                  setActiveArtifact(artifact)
                  setArtifactViewerOpen(true)
                  setArtifactQueueOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bg-hover group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-text-secondary group-hover:text-accent">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {artifact.title}
                  </div>
                  <div className="truncate text-xs text-text-muted">
                    {artifact.type} &middot; {artifact.size ? `${Math.round(artifact.size / 1024)}KB` : "pending"}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
