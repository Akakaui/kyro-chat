"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getProject,
  type Project,
} from "@/lib/api"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listProjects()
      setProjects(data.projects || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Organize conversations and knowledge bases into projects.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1" />
          New Project
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to organize related conversations and knowledge."
        />
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              expanded={expandedId === project.id}
              onToggle={() =>
                setExpandedId(expandedId === project.id ? null : project.id)
              }
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadProjects}
      />

      {editTarget && (
        <EditProjectModal
          project={editTarget}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
          onUpdated={loadProjects}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">
                {deleteTarget?.name}
              </span>
              ? Conversations and knowledge bases will be unlinked but not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return
                try {
                  await deleteProject(deleteTarget.id)
                  setDeleteTarget(null)
                  loadProjects()
                } catch {
                  /* silent */
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Project Card ─── */

function ProjectCard({
  project,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  project: Project
  expanded: boolean
  onToggle: () => void
  onEdit: (p: Project) => void
  onDelete: (p: Project) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <FolderKanban size={14} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">{project.name}</div>
          <div className="truncate text-xs text-text-muted">
            {project.description || "No description"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            <MessageSquare size={10} className="mr-1" />
            {project.conversation_count ?? 0}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            <BookOpen size={10} className="mr-1" />
            {project.kb_count ?? 0}
          </Badge>
        </div>
        <button
          onClick={onToggle}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          onClick={() => onEdit(project)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(project)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && <ProjectDetail projectId={project.id} />}
    </div>
  )
}

/* ─── Project Detail ─── */

function ProjectDetail({ projectId }: { projectId: string }) {
  const [details, setDetails] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const data = await getProject(projectId)
        if (!cancelled) setDetails(data.project)
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  if (loading) {
    return (
      <div className="border-t border-border bg-bg-primary/50 px-4 py-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-bg-primary/50 px-4 py-3">
      <div className="mb-2 text-[10px] font-medium uppercase text-text-muted">
        Project Details
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
        <div className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Description:</span>{" "}
          {(details as any)?.description || "None"}
        </div>
        {(details as any)?.custom_instructions && (
          <div className="mt-2 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Instructions:</span>{" "}
            <span className="whitespace-pre-wrap">{(details as any).custom_instructions}</span>
          </div>
        )}
      </div>
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

/* ─── Create Project Modal ─── */

function CreateProjectModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [customInstructions, setCustomInstructions] = useState("")
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setName("")
    setDescription("")
    setCustomInstructions("")
    setCreating(false)
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await createProject(name.trim(), description.trim())
      onCreated()
      handleClose(false)
    } catch {
      /* handled by API */
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Organize conversations and knowledge under a project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-text-secondary">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing Website"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Custom Instructions</label>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Instructions that apply to conversations in this project..."
              rows={3}
              className="mt-1.5"
            />
            <p className="mt-1 text-[11px] text-text-muted">
              These instructions are added to conversations within this project.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 size={14} className="mr-2 animate-spin" />}
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Edit Project Modal ─── */

function EditProjectModal({
  project,
  open,
  onOpenChange,
  onUpdated,
}: {
  project: Project
  open: boolean
  onOpenChange: (v: boolean) => void
  onUpdated: () => void
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || "")
  const [customInstructions, setCustomInstructions] = useState("")
  const [loadingDetails, setLoadingDetails] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(project.name)
    setDescription(project.description || "")
    let cancelled = false
    const load = async () => {
      try {
        setLoadingDetails(true)
        const data = await getProject(project.id)
        if (!cancelled) {
          setCustomInstructions((data.project as any).custom_instructions || "")
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoadingDetails(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [project])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateProject(project.id, name.trim(), description.trim())
      onUpdated()
      onOpenChange(false)
    } catch {
      /* handled by API */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update project name, description, and instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-text-secondary">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Custom Instructions</label>
            {loadingDetails ? (
              <div className="mt-1.5 flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-text-muted" />
              </div>
            ) : (
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Instructions that apply to conversations in this project..."
                rows={3}
                className="mt-1.5"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
