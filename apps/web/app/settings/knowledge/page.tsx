"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Trash2,
  Loader2,
  BookOpen,
  Upload,
  FileText,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
  getSettings,
  updateSettings,
  type KbSource,
} from "@/lib/api"

export default function KnowledgePage() {
  const [sources, setSources] = useState<KbSource[]>([])
  const [loading, setLoading] = useState(true)
  const [kbEnabled, setKbEnabled] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KbSource | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSources = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listKbSources()
      setSources(data.sources || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSources()
    const loadToggle = async () => {
      try {
        const settings = await getSettings()
        setKbEnabled(settings.capabilities?.artifacts !== false)
      } catch {
        /* silent */
      }
    }
    loadToggle()
  }, [loadSources])

  const handleToggle = async (checked: boolean) => {
    setKbEnabled(checked)
    try {
      await updateSettings({
        capabilities: { web_search: true, browser: true, artifacts: checked, code_execution: true, memory: true },
      })
    } catch {
      setKbEnabled(!checked)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadKbFile(file)
      loadSources()
    } catch {
      /* handled by API */
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteKbSource(deleteTarget.kb_id)
      setDeleteTarget(null)
      loadSources()
    } catch {
      /* silent */
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Knowledge Base</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Upload documents and manage knowledge sources for agent context.
        </p>
      </div>

      {/* Global Toggle */}
      <section className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">
              Enable Knowledge Base
            </div>
            <div className="text-xs text-text-muted">
              Allow agents to search uploaded documents for context.
            </div>
          </div>
          <Switch
            checked={kbEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </section>

      {/* Upload */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Uploaded Files</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {sources.length} source{sources.length !== 1 ? "s" : ""} across all projects.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Upload size={14} className="mr-1" />
            )}
            {uploading ? "Uploading..." : "Upload File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx,.csv,.json,.html,.xml"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No knowledge files"
            description="Upload documents to give agents context from your files."
          />
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.kb_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <FileText size={14} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {source.source_file}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{source.chunk_count} chunks</span>
                    {source.project_id && (
                      <Badge variant="outline" className="text-[9px]">
                        Project-scoped
                      </Badge>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDeleteTarget(source)}
                  className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Search hint */}
      <section className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex items-center gap-3">
          <Search size={16} className="text-text-muted" />
          <div>
            <div className="text-sm text-text-primary">Search Knowledge</div>
            <div className="text-xs text-text-muted">
              Agents automatically search relevant knowledge when answering questions. Files are chunked and embedded for semantic search.
            </div>
          </div>
        </div>
      </section>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Knowledge Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">
                {deleteTarget?.source_file}
              </span>
              ? This will remove all chunks and embeddings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Empty State ─── */

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
      <Icon size={28} className="mx-auto mb-3 text-text-muted" />
      <p className="text-sm text-text-secondary">{title}</p>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </div>
  )
}
