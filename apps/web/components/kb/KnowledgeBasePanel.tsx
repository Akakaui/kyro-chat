"use client"

import { useState, useEffect, useRef } from "react"
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Upload,
  X,
  BookOpen,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  listKbSources,
  deleteKbSource,
  uploadKbFile,
  type KbSource,
} from "@/lib/api"

export function KnowledgeBasePanel({ projectId }: { projectId?: string }) {
  const [sources, setSources] = useState<KbSource[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeKB, setActiveKB] = useState<KbSource | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KbSource | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadSources() {
    try {
      setLoading(true)
      const res = await listKbSources(projectId)
      setSources(res.sources || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSources()
  }, [projectId])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteKbSource(deleteTarget.kb_id)
      setSources((prev) => prev.filter((s) => s.kb_id !== deleteTarget.kb_id))
      setDeleteTarget(null)
      if (activeKB?.kb_id === deleteTarget.kb_id) setActiveKB(null)
    } catch {
      // silently fail
    } finally {
      setDeleting(false)
    }
  }

  function handleFileUpload(file: File) {
    setUploading(true)
    uploadKbFile(file, undefined, projectId)
      .then(() => loadSources())
      .catch(() => {})
      .finally(() => setUploading(false))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ""
  }

  // KB Detail view
  if (activeKB) {
    return (
      <div className="flex h-full flex-col">
        {/* Detail header */}
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <button
            onClick={() => setActiveKB(null)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="flex-1 truncate text-sm font-semibold text-text-primary">
            {activeKB.source_file}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            {/* Upload zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors",
                dragOver ? "border-accent bg-accent/5" : "border-border hover:border-text-muted"
              )}
            >
              {uploading ? (
                <Loader2 size={24} className="animate-spin text-accent" />
              ) : (
                <Upload size={24} className="text-text-muted" />
              )}
              <div className="text-center">
                <p className="text-sm text-text-primary">
                  {uploading ? "Uploading..." : "Drop files here"}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  PDF, TXT, MD, DOCX — up to 10 MB each
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Plus size={14} />
                Browse
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.docx,.csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {/* File info */}
            <div className="rounded-xl border border-border bg-bg-secondary p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                Source Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Filename</span>
                  <span className="text-text-primary font-mono text-xs">{activeKB.source_file}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Chunks</span>
                  <span className="text-text-primary">{activeKB.chunk_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Last Updated</span>
                  <span className="text-text-primary">
                    {new Date(activeKB.last_updated).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Delete button */}
            <Button
              variant="outline"
              className="w-full gap-2 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setDeleteTarget(activeKB)}
            >
              <X size={14} />
              Delete Knowledge Base
            </Button>
          </div>
        </ScrollArea>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
          <DialogContent className="max-w-sm bg-bg-secondary">
            <DialogHeader>
              <DialogTitle>Delete Knowledge Base</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="text-text-primary font-medium">
                  {deleteTarget?.source_file}
                </span>?
                All documents will be removed. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting && <Loader2 size={14} className="mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // KB List view
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold text-text-primary">Knowledge Bases</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-accent"
        >
          <Plus size={16} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
                <BookOpen size={28} className="text-text-muted" />
              </div>
              <p className="text-sm font-medium text-text-primary">
                Create your first knowledge base
              </p>
              <p className="mt-1 max-w-[200px] text-xs text-text-muted">
                Upload documents to give your agents context and expertise
              </p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                New Knowledge Base
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sources.map((kb) => (
                <div
                  key={kb.kb_id}
                  className="group relative cursor-pointer rounded-xl border border-border bg-bg-secondary p-3 transition-colors hover:border-text-muted"
                  onClick={() => setActiveKB(kb)}
                >
                  {/* Three-dot menu */}
                  <div className="absolute right-2 top-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(menuOpen === kb.kb_id ? null : kb.kb_id)
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-secondary"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen === kb.kb_id && (
                      <div className="absolute right-0 top-7 z-10 w-36 rounded-lg border border-border bg-bg-primary py-1 shadow-xl">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveKB(kb)
                            setMenuOpen(null)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                        >
                          View Details
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(kb)
                            setMenuOpen(null)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-bg-tertiary"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-tertiary">
                    <BookOpen size={18} className="text-accent" />
                  </div>
                  <p className="truncate text-sm font-medium text-text-primary">
                    {kb.source_file}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {kb.chunk_count} chunks
                  </p>
                </div>
              ))}

              {/* Add new card */}
              <button
                onClick={() => setCreateOpen(true)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border transition-colors hover:border-text-muted hover:bg-bg-secondary"
              >
                <Plus size={20} className="text-text-muted" />
                <span className="text-xs text-text-muted">New KB</span>
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create / Upload Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>New Knowledge Base</DialogTitle>
            <DialogDescription>
              Upload a document to create a new knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) {
                  handleFileUpload(file)
                  setCreateOpen(false)
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
                dragOver ? "border-accent bg-accent/5" : "border-border"
              )}
            >
              <Upload size={28} className="text-text-muted" />
              <div className="text-center">
                <p className="text-sm text-text-primary">Drop a file here</p>
                <p className="mt-1 text-xs text-text-muted">PDF, TXT, MD, DOCX — up to 10 MB</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = ".pdf,.txt,.md,.docx,.csv"
                  input.onchange = (e: any) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      handleFileUpload(file)
                      setCreateOpen(false)
                    }
                  }
                  input.click()
                }}
              >
                <Plus size={14} />
                Browse Files
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
