"use client"

import React, { useState, useEffect, useCallback } from "react"
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
  Terminal,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { listAllArtifacts, deleteArtifact, type Artifact } from "@/lib/api"
import { useChatStore, type SandboxFile } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

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
  const { setActiveArtifact, setArtifactViewerOpen, sandboxId, sandboxExpiration, setSandboxExpiration } = useChatStore()

  // Sandbox state
  const [sandboxFiles, setSandboxFiles] = useState<SandboxFile[]>([])
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState<string | null>(null)

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

  // Sandbox file fetching
  const fetchSandboxFiles = useCallback(async () => {
    if (!sandboxId) return
    setSandboxLoading(true)
    setSandboxError(null)
    try {
      const response = await fetch(`/api/sandbox/files/?path=/`)
      if (!response.ok) throw new Error("Failed to fetch files")
      const data = await response.json()
      setSandboxFiles(data.files || [])
    } catch (err) {
      setSandboxError(err instanceof Error ? err.message : "Failed to fetch files")
    } finally {
      setSandboxLoading(false)
    }
  }, [sandboxId])

  useEffect(() => {
    fetchSandboxFiles()
  }, [fetchSandboxFiles])

  // Sandbox expiration countdown
  useEffect(() => {
    if (!sandboxExpiration) {
      setTimeLeft(null)
      return
    }
    const tick = () => {
      const remaining = sandboxExpiration - Date.now()
      if (remaining <= 0) {
        setTimeLeft("Expired")
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setTimeLeft(`${mins}m ${secs}s`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [sandboxExpiration])

  const handleToggleDir = useCallback(async (dirPath: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath)
    } else {
      newExpanded.add(dirPath)
      try {
        const response = await fetch(`/api/sandbox/files/?path=${encodeURIComponent(dirPath)}`)
        if (!response.ok) throw new Error("Failed to fetch directory")
        const data = await response.json()
        setSandboxFiles((prev) => {
          const updated = [...prev]
          const dirIndex = updated.findIndex((f) => f.path === dirPath)
          if (dirIndex !== -1) {
            updated[dirIndex] = { ...updated[dirIndex], children: data.files }
          }
          return updated
        })
      } catch {
        // Silent fail
      }
    }
    setExpandedDirs(newExpanded)
  }, [expandedDirs])

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
  const codeArtifacts = artifacts.filter((a) =>
    ["html", "react", "code", "mermaid"].includes(a.type)
  )
  const docArtifacts = artifacts.filter((a) =>
    ["markdown", "pdf", "csv"].includes(a.type)
  )

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

      <Tabs defaultValue="all" className="flex flex-1 flex-col overflow-hidden">
        {/* Tab list */}
        <div className="border-b border-border px-4">
          <TabsList className="h-9 w-full justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-text-muted data-[state=active]:border-accent data-[state=active]:text-text-primary"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-text-muted data-[state=active]:border-accent data-[state=active]:text-text-primary"
            >
              Code
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-text-muted data-[state=active]:border-accent data-[state=active]:text-text-primary"
            >
              Documents
            </TabsTrigger>
            <TabsTrigger
              value="sandbox"
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-text-muted data-[state=active]:border-accent data-[state=active]:text-text-primary"
            >
              Sandbox
            </TabsTrigger>
          </TabsList>
        </div>

        {/* All Tab */}
        <TabsContent value="all" className="mt-0 flex-1 overflow-hidden">
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
          <ArtifactList
            artifacts={filtered}
            loading={loading}
            searchQuery={searchQuery}
            onSelect={setSelectedArtifact}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onShare={handleShare}
            onOpenInViewer={handleOpenInViewer}
            copied={copied}
          />
        </TabsContent>

        {/* Code Tab */}
        <TabsContent value="code" className="mt-0 flex-1 overflow-hidden">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5">
              <Search size={14} className="shrink-0 text-text-muted" />
              <input
                type="text"
                placeholder="Search code artifacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          <ArtifactList
            artifacts={codeArtifacts.filter(
              (a) =>
                a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.type.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            loading={loading}
            searchQuery={searchQuery}
            onSelect={setSelectedArtifact}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onShare={handleShare}
            onOpenInViewer={handleOpenInViewer}
            copied={copied}
          />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-0 flex-1 overflow-hidden">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5">
              <Search size={14} className="shrink-0 text-text-muted" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          <ArtifactList
            artifacts={docArtifacts.filter(
              (a) =>
                a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.type.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            loading={loading}
            searchQuery={searchQuery}
            onSelect={setSelectedArtifact}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onShare={handleShare}
            onOpenInViewer={handleOpenInViewer}
            copied={copied}
          />
        </TabsContent>

        {/* Sandbox Tab */}
        <TabsContent value="sandbox" className="mt-0 flex-1 overflow-hidden">
          {/* Expiration banner */}
          {sandboxId && timeLeft && timeLeft !== "Expired" && (
            <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
              <AlertTriangle size={12} className="shrink-0 text-amber-400" />
              <span className="text-[11px] font-medium text-amber-400">
                Sandbox expires in {timeLeft}
              </span>
            </div>
          )}
          {sandboxId && timeLeft === "Expired" && (
            <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2">
              <AlertTriangle size={12} className="shrink-0 text-red-400" />
              <span className="text-[11px] font-medium text-red-400">
                Sandbox expired
              </span>
            </div>
          )}

          {!sandboxId ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <Terminal size={32} className="mb-3 opacity-30" />
              <p className="text-xs">No active sandbox</p>
              <p className="mt-1 text-[10px]">A sandbox will appear when Kyro runs code</p>
            </div>
          ) : sandboxLoading && sandboxFiles.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-text-muted" />
            </div>
          ) : sandboxError ? (
            <div className="p-4 text-center text-xs text-red-400">{sandboxError}</div>
          ) : sandboxFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <FileCode size={32} className="mb-3 opacity-30" />
              <p className="text-xs">No files yet</p>
              <p className="mt-1 text-[10px]">Files will appear as the agent creates them</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              {sandboxFiles.map((file) => (
                <SandboxTreeItem
                  key={file.path}
                  file={file}
                  level={0}
                  expandedDirs={expandedDirs}
                  onToggleDir={handleToggleDir}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ─── Artifact List (shared across All / Code / Documents tabs) ─── */
interface ArtifactListProps {
  artifacts: Artifact[]
  loading: boolean
  searchQuery: string
  onSelect: (artifact: Artifact) => void
  onDelete: (id: string) => void
  onCopy: (content: string) => void
  onShare: (artifact: Artifact) => void
  onOpenInViewer: (artifact: Artifact) => void
  copied: boolean
}

function ArtifactList({
  artifacts,
  loading,
  searchQuery,
  onSelect,
  onDelete,
  onCopy,
  onShare,
  onOpenInViewer,
  copied,
}: ArtifactListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted">
        <FileCode size={32} className="mb-2 opacity-30" />
        <p className="text-xs">
          {searchQuery ? "No artifacts match your search" : "No artifacts yet"}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="space-y-1">
        {artifacts.map((artifact) => {
          const Icon = artifactIcons[artifact.type] || FileText
          const colorClass = artifactColors[artifact.type] || "text-text-muted"
          return (
            <div
              key={artifact.id}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-hover"
            >
              <button
                onClick={() => onSelect(artifact)}
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
                  onClick={() => onShare(artifact)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-accent"
                  title="Share"
                >
                  <Share2 size={14} />
                </button>
                <button
                  onClick={() => onCopy(artifact.content || "")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  title="Copy content"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => onDelete(artifact.id)}
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
    </div>
  )
}

/* ─── Sandbox Tree Item (for the Sandbox tab) ─── */
function SandboxTreeItem({
  file,
  level,
  expandedDirs,
  onToggleDir,
}: {
  file: SandboxFile
  level: number
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
}) {
  const isExpanded = expandedDirs.has(file.path)
  const Icon = file.isDirectory ? (isExpanded ? Globe : Globe) : FileCode

  return (
    <>
      <button
        onClick={() => file.isDirectory && onToggleDir(file.path)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-bg-hover"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {file.isDirectory && (
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-text-muted transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        )}
        <Icon size={14} className="shrink-0 text-text-secondary" />
        <span className="truncate text-text-primary">{file.name}</span>
        {file.size !== undefined && !file.isDirectory && (
          <span className="ml-auto text-[10px] text-text-muted">
            {file.size < 1024
              ? `${file.size}B`
              : file.size < 1024 * 1024
                ? `${Math.round(file.size / 1024)}KB`
                : `${Math.round(file.size / (1024 * 1024))}MB`}
          </span>
        )}
      </button>
      {file.isDirectory &&
        isExpanded &&
        file.children?.map((child) => (
          <SandboxTreeItem
            key={child.path}
            file={child}
            level={level + 1}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        ))}
    </>
  )
}
