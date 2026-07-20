"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  MoreHorizontal,
  FileCode,
  Trash2,
  Pencil,
  Copy,
  BookOpen,
  Upload,
  X,
  Loader2,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  type Skill,
} from "@/lib/api"

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<Skill | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadSkills() {
    try {
      setLoading(true)
      const res = await listSkills()
      setSkills(res.skills || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSkill(deleteTarget.id)
      setSkills((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      // silently fail
    } finally {
      setDeleting(false)
    }
  }

  function handleCreated(skill: Skill) {
    setSkills((prev) => [...prev, skill])
    setCreateOpen(false)
  }

  function handleUpdated(skill: Skill) {
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)))
    setEditSkill(null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold text-text-primary">Skills</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-accent"
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {/* Skill list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
              <FileCode size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-primary">No skills yet</p>
            <p className="mt-1 max-w-[220px] text-xs text-text-muted">
              Skills give your agents specialized instructions and capabilities
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              New Skill
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="group rounded-xl border border-border bg-bg-secondary p-3 transition-colors hover:border-text-muted"
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
                    <FileCode size={16} className="text-purple-400" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">{skill.name}</div>
                    {skill.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{skill.description}</p>
                    )}
                  </div>

                  {/* Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary">
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditSkill(skill)}>
                        <Pencil size={14} className="mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          await navigator.clipboard.writeText(skill.content || "")
                        }}
                      >
                        <Copy size={14} className="mr-2" />
                        Copy Content
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteTarget(skill)} className="text-danger">
                        <Trash2 size={14} className="mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Content preview */}
                {skill.content && (
                  <div className="mt-2 ml-12 line-clamp-2 rounded-lg bg-bg-primary/50 px-3 py-2 font-mono text-[11px] text-text-muted">
                    {skill.content.slice(0, 150)}{skill.content.length > 150 ? "..." : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <SkillModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* Edit Modal */}
      {editSkill && (
        <SkillModal
          open={!!editSkill}
          onOpenChange={(v) => { if (!v) setEditSkill(null) }}
          skill={editSkill}
          onCreated={handleUpdated}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">{deleteTarget?.name}</span>?
              This cannot be undone.
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

/* ──────────────────────── Skill Create/Edit Modal ──────────────────────── */

function SkillModal({
  open,
  onOpenChange,
  skill,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  skill?: Skill
  onCreated: (skill: Skill) => void
}) {
  const [name, setName] = useState(skill?.name || "")
  const [description, setDescription] = useState(skill?.description || "")
  const [content, setContent] = useState(skill?.content || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName(skill?.name || "")
      setDescription(skill?.description || "")
      setContent(skill?.content || "")
      setError("")
    }
  }, [open, skill])

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (!content.trim()) {
      setError("Content is required")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (skill) {
        const updated = await updateSkill(skill.id, {
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
        })
        onCreated(updated)
      } else {
        const created = await createSkill({
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
        })
        onCreated(created)
      }
    } catch (e: any) {
      setError(e.message || "Failed to save skill")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>{skill ? "Edit Skill" : "Create Skill"}</DialogTitle>
          <DialogDescription>
            {skill ? "Update skill instructions and content." : "Define specialized instructions for your agents."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div>
            <label className="text-xs text-text-secondary">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Review, Summarizer"
              className="mt-1.5"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              className="mt-1.5"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-text-secondary">Skill Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write the instructions, prompt template, or reference material for this skill..."
              rows={8}
              className="mt-1.5 font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              Use Markdown. This content is injected into the agent's system prompt.
            </p>
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !content.trim()}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            {skill ? "Save Changes" : "Create Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
