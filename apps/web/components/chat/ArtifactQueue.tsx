"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileCode,
  FileText,
  Image,
  X,
  Globe,
  Code,
  Download,
  ChevronUp,
  Layers,
  File,
  Film,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

const artifactIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  code: FileCode,
  document: FileText,
  image: Image,
  html: Globe,
  react: Code,
  markdown: FileText,
  video: Film,
  csv: File,
  mermaid: FileCode,
  pdf: FileText,
}

export function ArtifactQueue() {
  const {
    artifacts,
    artifactQueueOpen,
    setArtifactQueueOpen,
    setActiveArtifact,
    setArtifactViewerOpen,
  } = useChatStore()
  const [expanded, setExpanded] = useState(false)

  if (artifacts.length === 0) return null

  return (
    <>
      {/* Floating indicator badge */}
      <AnimatePresence>
        {!expanded && artifacts.length > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setExpanded(true)}
            className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full glass px-3 py-2 shadow-lg shadow-black/20 transition-colors hover:bg-white/10 md:bottom-8"
          >
            <Layers size={14} className="text-accent" />
            <span className="text-xs font-medium text-text-primary">{artifacts.length}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded panel — slides up from bottom */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setExpanded(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-2xl glass border-t border-white/10 pb-safe md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:inset-x-auto md:w-80 md:rounded-2xl md:border md:border-border md:bg-bg-secondary md:backdrop-blur-none md:shadow-2xl"
            >
              {/* Handle */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20 md:hidden" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Artifacts
                  <span className="ml-1.5 text-xs text-text-muted">({artifacts.length})</span>
                </h3>
                <button
                  onClick={() => setExpanded(false)}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <X size={14} />
                </button>
              </div>

              {/* List */}
              <div className="max-h-[45vh] overflow-y-auto px-2 pb-2">
                {artifacts.map((artifact) => {
                  const Icon = artifactIcons[artifact.type] || FileText
                  return (
                    <button
                      key={artifact.id}
                      onClick={() => {
                        setActiveArtifact(artifact)
                        setArtifactViewerOpen(true)
                        setExpanded(false)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bg-hover group"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-text-secondary group-hover:text-accent transition-colors">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {artifact.title}
                        </div>
                        <div className="truncate text-xs text-text-muted">
                          {artifact.type}
                          {artifact.size
                            ? ` \u00B7 ${Math.round(artifact.size / 1024)}KB`
                            : ""}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Download All */}
              {artifacts.length > 1 && (
                <div className="border-t border-border px-4 py-3">
                  <button
                    onClick={() => {
                      artifacts.forEach((a) => {
                        if (a.url) {
                          const link = document.createElement("a")
                          link.href = a.url
                          link.download = a.title
                          link.click()
                        }
                      })
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-tertiary px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Download size={14} />
                    Download All
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
