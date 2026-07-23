"use client"

import React from "react"
import {
  FileCode,
  FileText,
  Globe,
  Code,
  Image,
  Download,
  Share2,
  Copy,
  Check,
  MoreVertical,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { ScrollArea } from "@/components/ui/scroll-area"

const artifactIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  code: FileCode,
  html: Globe,
  react: Code,
  markdown: FileText,
  image: Image,
}

const artifactColors: Record<string, string> = {
  code: "text-green-400",
  html: "text-orange-400",
  react: "text-cyan-400",
  markdown: "text-purple-400",
  image: "text-pink-400",
}

export function ArtifactBottomSheet() {
  const { artifacts, artifactSheetOpen, setArtifactSheetOpen, setActiveArtifact, setArtifactViewerOpen } = useChatStore()
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const handleOpen = React.useCallback((artifact: typeof artifacts[0]) => {
    setActiveArtifact(artifact)
    setArtifactViewerOpen(true)
    setArtifactSheetOpen(false)
  }, [setActiveArtifact, setArtifactViewerOpen, setArtifactSheetOpen])

  const handleCopy = React.useCallback(async (artifact: typeof artifacts[0]) => {
    await navigator.clipboard.writeText(artifact.content || "")
    setCopiedId(artifact.id)
    setOpenMenuId(null)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleDownload = React.useCallback((artifact: typeof artifacts[0]) => {
    const blob = new Blob([artifact.content || ""], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${artifact.title || "artifact"}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setOpenMenuId(null)
  }, [])

  const handleDownloadAll = React.useCallback(() => {
    artifacts.forEach((a) => {
      const blob = new Blob([a.content || ""], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${a.title || "artifact"}.txt`
      link.click()
      URL.revokeObjectURL(url)
    })
  }, [artifacts])

  const handleShare = React.useCallback((artifact: typeof artifacts[0]) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${artifact.id}`)
    setOpenMenuId(null)
  }, [])

  const handleShareAsPdf = React.useCallback((artifact: typeof artifacts[0]) => {
    const content = artifact.content || ""
    const win = window.open("", "_blank")
    if (win) {
      win.document.write(`<html><head><title>${artifact.title}</title></head><body><pre>${content}</pre></body></html>`)
      win.document.close()
      win.print()
    }
    setOpenMenuId(null)
  }, [])

  return (
    <AnimatePresence>
      {artifactSheetOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
            onClick={() => setArtifactSheetOpen(false)}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-2xl border-t border-white/10 bg-[#0f0f12] sm:hidden"
          >
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white/90">
                  Artifacts ({artifacts.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
                >
                  <Download size={12} />
                  Download All
                </button>
                <button
                  onClick={() => setArtifactSheetOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/90"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Artifact list */}
            <ScrollArea className="max-h-[calc(70vh-100px)] p-2">
              <div className="space-y-1">
                {artifacts.map((artifact) => {
                  const Icon = artifactIcons[artifact.type] || FileText
                  const colorClass = artifactColors[artifact.type] || "text-white/40"
                  const isMenuOpen = openMenuId === artifact.id

                  return (
                    <div
                      key={artifact.id}
                      className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
                    >
                      <button
                        onClick={() => handleOpen(artifact)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5",
                            colorClass
                          )}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white/90">
                            {artifact.title}
                          </div>
                          <div className="truncate text-xs text-white/40">
                            {artifact.type}
                            {artifact.size ? ` \u00b7 ${Math.round(artifact.size / 1024)}KB` : ""}
                          </div>
                        </div>
                      </button>

                      {/* Three-dot menu */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setOpenMenuId(isMenuOpen ? null : artifact.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/90"
                        >
                          <MoreVertical size={14} />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a20] p-1 shadow-xl">
                              <button
                                onClick={() => handleShare(artifact)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                              >
                                <Share2 size={13} />
                                Share
                              </button>
                              <button
                                onClick={() => handleCopy(artifact)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                              >
                                {copiedId === artifact.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                                {copiedId === artifact.id ? "Copied" : "Copy"}
                              </button>
                              <button
                                onClick={() => handleDownload(artifact)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                              >
                                <Download size={13} />
                                Download
                              </button>
                              <div className="my-0.5 border-t border-white/10" />
                              <button
                                onClick={() => handleShareAsPdf(artifact)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                              >
                                <FileText size={13} />
                                Share as PDF
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
