"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Bot,
  ChevronDown,
  ChevronRight,
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
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentKBAvailable,
  setAgentKBPermission,
  type Agent,
  type AgentKBAvailable,
} from "@/lib/api"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listAgents()
      setAgents(data.agents || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Agents</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create and configure AI agents with custom instructions and tool access.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1" />
          New Agent
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first agent to get started."
        />
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              expanded={expandedId === agent.id}
              onToggle={() =>
                setExpandedId(expandedId === agent.id ? null : agent.id)
              }
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <CreateAgentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadAgents}
      />

      {editTarget && (
        <EditAgentModal
          agent={editTarget}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
          onUpdated={loadAgents}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">
                {deleteTarget?.name}
              </span>
              ? This cannot be undone.
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
                  await deleteAgent(deleteTarget.id)
                  setDeleteTarget(null)
                  loadAgents()
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

/* ─── Agent Card ─── */

function AgentCard({
  agent,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  agent: Agent
  expanded: boolean
  onToggle: () => void
  onEdit: (a: Agent) => void
  onDelete: (a: Agent) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Bot size={14} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">{agent.name}</div>
          <div className="truncate text-xs text-text-muted">
            {agent.description || "No description"}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {agent.type}
        </Badge>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {agent.model || "default"}
        </Badge>
        <button
          onClick={onToggle}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          onClick={() => onEdit(agent)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(agent)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && <AgentDetail agentId={agent.id} />}
    </div>
  )
}

/* ─── Agent Detail (KB Permissions) ─── */

function AgentDetail({ agentId }: { agentId: string }) {
  const [kbs, setKbs] = useState<AgentKBAvailable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const data = await getAgentKBAvailable(agentId)
        if (!cancelled) setKbs(data.kbs || [])
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [agentId])

  const handlePermissionChange = async (kbId: string, permission: "allow" | "ask" | "deny") => {
    try {
      await setAgentKBPermission(agentId, kbId, permission)
      setKbs((prev) =>
        prev.map((kb) =>
          kb.kb_id === kbId ? { ...kb, permission } : kb
        )
      )
    } catch {
      /* silent */
    }
  }

  return (
    <div className="border-t border-border bg-bg-primary/50 px-4 py-3">
      <div className="mb-2 text-[10px] font-medium uppercase text-text-muted">
        Knowledge Base Access
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : kbs.length === 0 ? (
        <p className="text-xs text-text-muted">
          No knowledge bases available. Upload files in Knowledge settings.
        </p>
      ) : (
        <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
          {kbs.map((kb) => (
            <div
              key={kb.kb_id}
              className="flex items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-text-primary truncate">
                  {kb.name}
                </div>
                {kb.project_id && (
                  <div className="text-[10px] text-text-muted">Project-scoped</div>
                )}
              </div>
              <div className="flex gap-1">
                {(["allow", "ask", "deny"] as const).map((perm) => (
                  <button
                    key={perm}
                    onClick={() => handlePermissionChange(kb.kb_id, perm)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      kb.permission === perm
                        ? perm === "allow"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : perm === "ask"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-red-500/20 text-red-400"
                        : "text-text-muted hover:bg-bg-hover"
                    }`}
                  >
                    {perm.charAt(0).toUpperCase() + perm.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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

/* ─── Create Agent Modal ─── */

function CreateAgentModal({
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
  const [systemPrompt, setSystemPrompt] = useState("")
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setName("")
    setDescription("")
    setSystemPrompt("")
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
      await createAgent({
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
      })
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
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>
            Add a new AI agent with custom instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-text-secondary">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Assistant"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Custom Instructions</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="System prompt that guides agent behavior..."
              rows={4}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 size={14} className="mr-2 animate-spin" />}
            {creating ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Edit Agent Modal ─── */

function EditAgentModal({
  agent,
  open,
  onOpenChange,
  onUpdated,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (v: boolean) => void
  onUpdated: () => void
}) {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description || "")
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(agent.name)
    setDescription(agent.description || "")
    setSystemPrompt(agent.system_prompt || "")
  }, [agent])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateAgent(agent.id, {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
      })
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
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Update agent configuration and instructions.
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
              placeholder="What does this agent do?"
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Custom Instructions</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="System prompt that guides agent behavior..."
              rows={4}
              className="mt-1.5"
            />
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
