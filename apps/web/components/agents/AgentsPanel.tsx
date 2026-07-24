"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus,
  MoreHorizontal,
  Bot,
  Trash2,
  Pencil,
  Copy,
  Users,
  Brain,
  Wrench,
  ChevronRight,
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
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type Agent,
} from "@/lib/api"

const AGENT_TYPES: { value: "primary" | "sub" | "both"; label: string; icon: any; description: string }[] = [
  { value: "primary", label: "Primary", icon: Bot, description: "Full-featured agent with all capabilities" },
  { value: "sub", label: "Sub-agent", icon: Wrench, description: "Specialized agent for specific tasks" },
  { value: "both", label: "Both", icon: Users, description: "Can act as primary or sub-agent" },
]

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
]

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadAgents() {
    try {
      setLoading(true)
      const res = await listAgents()
      setAgents(res.agents || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAgent(deleteTarget.id)
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      // silently fail
    } finally {
      setDeleting(false)
    }
  }

  function handleCreated(agent: Agent) {
    setAgents((prev) => [...prev, agent])
    setCreateOpen(false)
  }

  function handleUpdated(agent: Agent) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)))
    setEditAgent(null)
  }

  const typeIcon = (type: string) => {
    const t = AGENT_TYPES.find((at) => at.value === type)
    return t ? <t.icon size={14} /> : <Bot size={14} />
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold text-text-primary">Agents</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-accent"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
              <Bot size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-primary">No agents yet</p>
            <p className="mt-1 max-w-[200px] text-xs text-text-muted">
              Create your first agent to get started
            </p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              New Agent
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="group rounded-xl border border-border bg-bg-secondary p-3 transition-colors hover:border-text-muted"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                    {agent.name?.[0]?.toUpperCase() || "A"}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">{agent.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      {typeIcon(agent.type || "primary")}
                      <span>{AGENT_TYPES.find((t) => t.value === (agent.type || "primary"))?.label || "Primary"}</span>
                      {agent.model && (
                        <>
                          <span>·</span>
                          <span>{MODEL_OPTIONS.find((m) => m.value === agent.model)?.label || agent.model}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary">
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditAgent(agent)}>
                        <Pencil size={14} className="mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          await navigator.clipboard.writeText(JSON.stringify(agent, null, 2))
                        }}
                      >
                        <Copy size={14} className="mr-2" />
                        Copy JSON
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteTarget(agent)} className="text-danger">
                        <Trash2 size={14} className="mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Description */}
                {agent.description && (
                  <p className="mt-2 line-clamp-2 pl-12 text-xs text-text-muted">
                    {agent.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AgentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* Edit Modal */}
      {editAgent && (
        <AgentModal
          open={!!editAgent}
          onOpenChange={(v) => { if (!v) setEditAgent(null) }}
          agent={editAgent}
          onCreated={handleUpdated}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
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

/* ──────────────────────── Agent Create/Edit Modal ──────────────────────── */

function AgentModal({
  open,
  onOpenChange,
  agent,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  agent?: Agent
  onCreated: (agent: Agent) => void
}) {
  const [name, setName] = useState(agent?.name || "")
  const [description, setDescription] = useState(agent?.description || "")
  const [type, setType] = useState<"primary" | "sub" | "both">(agent?.type || "primary")
  const [model, setModel] = useState(agent?.model || "gpt-4o")
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || "")
  const [toolPermissions, setToolPermissions] = useState<Record<string, 'allow' | 'deny' | 'ask'>>(agent?.tool_permissions || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName(agent?.name || "")
      setDescription(agent?.description || "")
      setType(agent?.type || "primary")
      setModel(agent?.model || "gpt-4o")
      setSystemPrompt(agent?.system_prompt || "")
      setToolPermissions(agent?.tool_permissions || {})
      setError("")
    }
  }, [open, agent])

  function setToolPerm(tool: string, perm: 'allow' | 'deny' | 'ask') {
    setToolPermissions(prev => ({ ...prev, [tool]: perm }))
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (agent) {
        const updated = await updateAgent(agent.id, {
          name: name.trim(),
          description: description.trim(),
          type,
          model,
          system_prompt: systemPrompt.trim(),
          tool_permissions: toolPermissions,
        })
        onCreated(updated)
      } else {
        const created = await createAgent({
          name: name.trim(),
          description: description.trim(),
          type,
          model,
          system_prompt: systemPrompt.trim(),
          toolPermissions,
        })
        onCreated(created)
      }
    } catch (e: any) {
      setError(e.message || "Failed to save agent")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Create Agent"}</DialogTitle>
          <DialogDescription>
            {agent ? "Update your agent's configuration." : "Set up a new agent with its own personality and capabilities."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div>
            <label className="text-xs text-text-secondary">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kyro, Riva, Astra"
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
              placeholder="What does this agent do?"
              className="mt-1.5"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-text-secondary">Agent Type</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {AGENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors ${
                    type === t.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg-primary text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  <t.icon size={18} />
                  <span className="font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="text-xs text-text-secondary">Default Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-xs text-text-secondary">System Prompt</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={4}
              className="mt-1.5 font-mono text-xs"
            />
          </div>

          {/* Tool Permissions */}
          <div>
            <label className="text-xs text-text-secondary">Tool Permissions</label>
            <div className="mt-2 space-y-3">
              {[
                { category: 'File', tools: ['create_file', 'read_file', 'update_file', 'delete_file'] },
                { category: 'Code', tools: ['execute_code', 'sandbox_create', 'sandbox_read', 'sandbox_write', 'sandbox_list', 'sandbox_remove'] },
                { category: 'Search', tools: ['web_search', 'web_fetch'] },
                { category: 'Web', tools: ['browser_navigate', 'browser_click', 'browser_type', 'browser_extract', 'browser_screenshot'] },
                { category: 'Agent', tools: ['agent_call', 'agent_list'] },
                { category: 'Artifacts', tools: ['artifact_create', 'artifact_update', 'artifact_search'] },
                { category: 'Memory', tools: ['memory_store', 'memory_search', 'memory_get'] },
              ].map(group => (
                <div key={group.category}>
                  <div className="text-[10px] font-medium uppercase text-text-muted mb-1">{group.category}</div>
                  <div className="space-y-1">
                    {group.tools.map(tool => (
                      <div key={tool} className="flex items-center justify-between rounded-md bg-bg-primary px-2 py-1.5">
                        <span className="text-xs text-text-secondary font-mono">{tool}</span>
                        <div className="flex gap-1">
                          {(['allow', 'ask', 'deny'] as const).map(perm => (
                            <button
                              key={perm}
                              onClick={() => setToolPerm(tool, perm)}
                              className={`h-6 w-6 flex items-center justify-center rounded-md border text-[10px] transition-all ${
                                toolPermissions[tool] === perm
                                  ? perm === 'allow'
                                    ? 'bg-success/20 border-success text-success'
                                    : perm === 'ask'
                                    ? 'bg-accent/20 border-accent text-accent'
                                    : 'bg-danger/20 border-danger text-danger'
                                  : perm === 'allow'
                                  ? 'border-success/30 text-success/50 hover:bg-success/10'
                                  : perm === 'ask'
                                  ? 'border-accent/30 text-accent/50 hover:bg-accent/10'
                                  : 'border-danger/30 text-danger/50 hover:bg-danger/10'
                              }`}
                              title={perm.charAt(0).toUpperCase() + perm.slice(1)}
                            >
                              {perm === 'allow' ? '✓' : perm === 'ask' ? '?' : '✗'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            {agent ? "Save Changes" : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
