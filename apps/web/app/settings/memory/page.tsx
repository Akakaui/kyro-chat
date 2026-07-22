"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Trash2,
  Loader2,
  Brain,
  Pencil,
  AlertTriangle,
  Clock,
  X,
  Check,
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
  getMemoryToggle,
  setMemoryToggle,
  listRecentMemories,
  updateMemory,
  deleteMemory,
  wipeAllMemories,
  type MemoryEntry,
} from "@/lib/api"

export default function MemoryPage() {
  const [enabled, setEnabled] = useState(true)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [editTarget, setEditTarget] = useState<MemoryEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null)
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false)
  const [wiping, setWiping] = useState(false)

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listRecentMemories(50)
      setMemories(data.memories || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  const loadToggle = useCallback(async () => {
    try {
      const data = await getMemoryToggle()
      setEnabled(data.enabled)
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    loadToggle()
    loadMemories()
  }, [loadToggle, loadMemories])

  const handleToggle = async (checked: boolean) => {
    setToggling(true)
    try {
      await setMemoryToggle(checked)
      setEnabled(checked)
    } catch {
      setEnabled(!checked)
    } finally {
      setToggling(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMemory(deleteTarget.id)
      setMemories((prev) => prev.filter((m) => m.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      /* silent */
    }
  }

  const handleWipe = async () => {
    setWiping(true)
    try {
      await wipeAllMemories()
      setMemories([])
      setWipeConfirmOpen(false)
    } catch {
      /* silent */
    } finally {
      setWiping(false)
    }
  }

  const handleSaveEdit = async (updated: { content: string; importance: number }) => {
    if (!editTarget) return
    try {
      await updateMemory(editTarget.id, updated)
      setMemories((prev) =>
        prev.map((m) =>
          m.id === editTarget.id
            ? { ...m, content: updated.content, importance: updated.importance }
            : m
        )
      )
      setEditTarget(null)
    } catch {
      /* silent */
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Memory</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage what the agent remembers across conversations.
        </p>
      </div>

      {/* Toggle */}
      <section className="rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">
              Enable Memory
            </div>
            <div className="text-xs text-text-muted">
              Allow the agent to store and recall facts across conversations.
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
          />
        </div>
      </section>

      {/* Memory List */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Stored Memories</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {memories.length} memor{memories.length !== 1 ? "ies" : "y"} stored.
            </p>
          </div>
          {memories.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWipeConfirmOpen(true)}
              className="text-danger hover:text-danger"
            >
              <Trash2 size={14} className="mr-1" />
              Wipe All
            </Button>
          )}
        </div>

        {!enabled ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
            <Brain size={28} className="mx-auto mb-3 text-text-muted" />
            <p className="text-sm text-text-secondary">Memory is disabled</p>
            <p className="mt-1 text-xs text-text-muted">
              Enable memory to let the agent remember facts across conversations.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : memories.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
            <Brain size={28} className="mx-auto mb-3 text-text-muted" />
            <p className="text-sm text-text-secondary">No memories stored yet</p>
            <p className="mt-1 text-xs text-text-muted">
              The agent will automatically store important facts as you chat.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="rounded-xl border border-border bg-bg-secondary px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {memory.content}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {memory.type}
                      </Badge>
                      <span className="flex items-center gap-1 text-[10px] text-text-muted">
                        <Clock size={10} />
                        {new Date(memory.created_at * 1000).toLocaleDateString()}
                      </span>
                      {memory.importance > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          importance: {memory.importance}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditTarget(memory)}
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(memory)}
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit Modal */}
      {editTarget && (
        <EditMemoryModal
          memory={editTarget}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
          onSave={handleSaveEdit}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this memory? This cannot be undone.
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

      {/* Wipe All Confirmation */}
      <Dialog open={wipeConfirmOpen} onOpenChange={setWipeConfirmOpen}>
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Wipe All Memories</DialogTitle>
            <DialogDescription>
              <span className="flex items-center gap-2 text-amber-400 mb-2">
                <AlertTriangle size={16} />
                This action is irreversible.
              </span>
              This will permanently delete all {memories.length} stored memories.
              The agent will need to re-learn everything from scratch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWipeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleWipe}
              disabled={wiping}
            >
              {wiping && <Loader2 size={14} className="mr-2 animate-spin" />}
              {wiping ? "Wiping..." : "Wipe All Memories"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Edit Memory Modal ─── */

function EditMemoryModal({
  memory,
  open,
  onOpenChange,
  onSave,
}: {
  memory: MemoryEntry
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (data: { content: string; importance: number }) => void
}) {
  const [content, setContent] = useState(memory.content)
  const [importance, setImportance] = useState(memory.importance)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setContent(memory.content)
    setImportance(memory.importance)
  }, [memory])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ content, importance })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>Edit Memory</DialogTitle>
          <DialogDescription>
            Update the content and importance of this memory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-text-secondary">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">
              Importance ({importance})
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="mt-1.5 w-full"
            />
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
