"use client"

import React, { useState } from "react"
import {
  FileCode,
  FileText,
  Image,
  Globe,
  Code,
  Search,
  Trash2,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  Share2,
  ExternalLink,
  Link2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { listAllArtifacts, deleteArtifact, type Artifact } from "@/lib/api"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"

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

export function ArtifactPanel() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareHash, setShareHash] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [remixLoading, setRemixLoading] = useState(false)
  const { setActiveArtifact, setArtifactViewerOpen } = useChatStore()

  const fetchArtifacts = React.useCallback(async () => {
    setLoading(true)
    try {
      const { artifacts: list } = await listAllArtifacts(100)
      setArtifacts(list)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchArtifacts()
  }, [fetchArtifacts])

  const filtered = artifacts.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    try {
      await deleteArtifact(id)
      setArtifacts((prev) => prev.filter((a) => a.id !== id))
      if (selectedArtifact?.id === id) setSelectedArtifact(null)
    } catch {
      // silently fail
    }
  }

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenInViewer = (artifact: Artifact) => {
    setActiveArtifact(artifact)
    setArtifactViewerOpen(true)
  }

  const handleShare = async (artifact: Artifact) => {
    setShareLoading(true)
    try {
      const res = await fetch(`/api/artifacts/share/${artifact.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (data.hash) {
        setShareHash(data.hash)
        setShareModalOpen(true)
      }
    } catch {
      // silently fail
    } finally {
      setShareLoading(false)
    }
  }

  const handleRemix = async (artifact: Artifact) => {
    setRemixLoading(true)
    try {
      const res = await fetch(`/api/artifacts/share/${artifact.id}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (data.conversationId) {
        window.location.href = `/chat?conversation=${data.conversationId}`
      }
    } catch {
      // silently fail
    } finally {
      setRemixLoading(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!shareHash) return
    const url = `${window.location.origin}/share/${shareHash}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Detail view
  if (selectedArtifact) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            onClick={() => setSelectedArtifact(null)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {selectedArtifact.title}
            </h3>
            <span className="text-xs text-text-muted">{selectedArtifact.type}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleShare(selectedArtifact)}
              disabled={shareLoading}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              title="Share"
            >
              <Share2 size={14} />
            </button>
            <button
              onClick={() => handleRemix(selectedArtifact)}
              disabled={remixLoading}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
              title="Remix in new conversation"
            >
              <ExternalLink size={14} />
            </button>
            <button
              onClick={() => handleCopy(selectedArtifact.content || "")}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => handleOpenInViewer(selectedArtifact)}
              className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
            >
              Open
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {selectedArtifact.type === "image" && selectedArtifact.url ? (
            <img
              src={selectedArtifact.url}
              alt={selectedArtifact.title}
              className="rounded-lg object-contain"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-primary">
              {selectedArtifact.content}
            </pre>
          )}
        </div>

        {/* Share modal */}
        {shareModalOpen && shareHash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-bg-primary p-5">
              <h4 className="text-sm font-semibold text-text-primary">Share Artifact</h4>
              <p className="mt-1 text-xs text-text-muted">
                Anyone with this link can view this artifact
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareHash}`}
                  className="flex-1 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary"
                />
                <Button size="sm" className="gap-1.5" onClick={handleCopyShareLink}>
                  <Link2 size={12} />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShareModalOpen(false)
                    setShareHash(null)
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          Artifacts
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          All artifacts across every conversation
        </p>
      </div>

      {/* Search */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5">
          <Search size={14} className="shrink-0 text-text-muted" />
          <input
            type="text"
            placeholder="Search artifacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <FileCode size={32} className="mb-2 opacity-30" />
            <p className="text-xs">
              {searchQuery ? "No artifacts match your search" : "No artifacts yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((artifact) => {
              const Icon = artifactIcons[artifact.type] || FileText
              const colorClass = artifactColors[artifact.type] || "text-text-muted"
              return (
                <div
                  key={artifact.id}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-hover"
                >
                  <button
                    onClick={() => setSelectedArtifact(artifact)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary",
                        colorClass
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {artifact.title}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {artifact.type} &middot;{" "}
                        {artifact.size
                          ? `${Math.round(artifact.size / 1024)}KB`
                          : "pending"}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleShare(artifact)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-accent"
                      title="Share"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      onClick={() => handleCopy(artifact.content || "")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                      title="Copy content"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(artifact.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
