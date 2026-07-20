"use client"

import { useState, useRef, useEffect } from "react"
import {
  Plus,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Globe,
  Key,
  Shield,
  Pencil,
  RefreshCw,
  Upload,
  CheckCircle2,
  XCircle,
  X,
  Search,
  Lock,
} from "lucide-react"
import { useChatStore } from "@/stores/chat"
import type { Connector, MCPTool } from "@/stores/chat"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  listConnectors,
  createConnector,
  deleteConnector,
  discoverEndpoints,
  getConnectorTools,
  type CustomConnector,
  type ConnectorTool,
} from "@/lib/api"

export function ConnectorsPanel() {
  const {
    connectors,
    removeConnector,
    updateConnector,
    setPermissionsPanelOpen,
  } = useChatStore()

  const [mcpModalOpen, setMcpModalOpen] = useState(false)
  const [apiModalOpen, setApiModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null)
  const [customApis, setCustomApis] = useState<CustomConnector[]>([])
  const [loadingApis, setLoadingApis] = useState(true)

  const mcpServers = connectors.filter((c) => c.type === "mcp")

  useEffect(() => {
    loadCustomApis()
  }, [])

  const loadCustomApis = async () => {
    try {
      setLoadingApis(true)
      const data = await listConnectors()
      setCustomApis(data.connectors)
    } catch {
      // Silent fail
    } finally {
      setLoadingApis(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* MCP Servers Section */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase text-text-muted">
            MCP Servers
          </h3>
          <button
            onClick={() => setMcpModalOpen(true)}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {mcpServers.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
            <Globe size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-secondary">No MCP servers connected</p>
            <p className="mt-1 text-xs text-text-muted">
              Add an MCP server to extend capabilities
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mcpServers.map((server) => (
              <MCPCard
                key={server.id}
                connector={server}
                onDeleteRequest={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </section>

      {/* Custom APIs Section */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase text-text-muted">
            Custom APIs
          </h3>
          <button
            onClick={() => setApiModalOpen(true)}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-accent transition-colors hover:bg-accent/10"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {loadingApis ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : customApis.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
            <Key size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-secondary">No custom APIs added</p>
            <p className="mt-1 text-xs text-text-muted">
              Add an API - agent discovers endpoints automatically
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {customApis.map((api) => (
              <CustomAPICard
                key={api.id}
                api={api}
                onRefresh={loadCustomApis}
              />
            ))}
          </div>
        )}
      </section>

      {/* Add MCP Modal */}
      <AddMCPModal open={mcpModalOpen} onOpenChange={setMcpModalOpen} />

      {/* Add API Modal */}
      <AddCustomAPIModal
        open={apiModalOpen}
        onOpenChange={setApiModalOpen}
        onCreated={loadCustomApis}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === "mcp" ? "Server" : "API"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">{deleteTarget?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  removeConnector(deleteTarget.id)
                  setDeleteTarget(null)
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

/* ──────────────────────── MCP Card ──────────────────────── */

function MCPCard({
  connector,
  onDeleteRequest,
}: {
  connector: Connector
  onDeleteRequest: (c: Connector) => void
}) {
  const { updateConnector, setPermissionsPanelOpen } = useChatStore()

  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(connector.name)
  const renameRef = useRef<HTMLInputElement>(null)
  const tools = connector.tools || []

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renaming])

  const handleToggle = (checked: boolean) => {
    updateConnector(connector.id, {
      status: checked ? "connected" : "disconnected",
    })
  }

  const handleRenameSave = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== connector.name) {
      updateConnector(connector.id, { name: trimmed })
    } else {
      setRenameValue(connector.name)
    }
    setRenaming(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={connector.status === "connected"}
          onCheckedChange={handleToggle}
          className="shrink-0"
        />
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
            connector.status === "connected" ? "bg-success" : "bg-text-muted"
          }`}
        />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSave()
                if (e.key === "Escape") {
                  setRenameValue(connector.name)
                  setRenaming(false)
                }
              }}
              className="w-full rounded border border-accent bg-bg-primary px-1.5 py-0.5 text-sm font-medium text-text-primary outline-none"
            />
          ) : (
            <div className="text-sm font-medium text-text-primary">{connector.name}</div>
          )}
          <div className="truncate text-xs text-text-muted">{connector.url}</div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {tools.length} tools
        </Badge>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary">
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <Pencil size={14} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setPermissionsPanelOpen(true, connector.id)}
            >
              <Shield size={14} className="mr-2" />
              Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteRequest(connector)}
              className="text-danger"
            >
              <Trash2 size={14} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="border-t border-border bg-bg-primary/50 px-4 py-3">
          <div className="mb-2 text-[10px] font-medium uppercase text-text-muted">
            Available Tools ({tools.length})
          </div>
          {tools.length === 0 ? (
            <p className="text-xs text-text-muted">No tools discovered yet.</p>
          ) : (
            <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-medium text-text-primary">
                      {tool.name}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                      {tool.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── Custom API Card ──────────────────────── */

function CustomAPICard({
  api,
  onRefresh,
}: {
  api: CustomConnector
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [tools, setTools] = useState<ConnectorTool[]>([])
  const [loadingTools, setLoadingTools] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const loadTools = async () => {
    try {
      setLoadingTools(true)
      const data = await getConnectorTools(api.id)
      setTools(data.tools)
    } catch {
      // Silent fail
    } finally {
      setLoadingTools(false)
    }
  }

  const handleDiscover = async () => {
    try {
      setDiscovering(true)
      await discoverEndpoints(api.id)
      await loadTools()
      onRefresh()
    } catch {
      // Silent fail
    } finally {
      setDiscovering(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteConnector(api.id)
      setDeleteConfirmOpen(false)
      onRefresh()
    } catch {
      // Silent fail
    }
  }

  const handleExpand = () => {
    setExpanded(!expanded)
    if (!expanded && tools.length === 0) {
      loadTools()
    }
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          {api.image ? (
            <img
              src={api.image}
              alt={api.name}
              className="h-8 w-8 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary">
              <Key size={14} className="text-text-muted" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary">{api.name}</div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>{api.baseUrl || "No base URL"}</span>
              <Badge
                variant="outline"
                className={`text-[9px] ${
                  api.status === "ready"
                    ? "border-success/40 text-success bg-success/10"
                    : api.status === "discovering"
                    ? "border-accent/40 text-accent bg-accent/10"
                    : api.status === "error"
                    ? "border-danger/40 text-danger bg-danger/10"
                    : "border-border bg-bg-tertiary text-text-muted"
                }`}
              >
                {api.status === "discovering" ? "Discovering..." : api.status}
              </Badge>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {tools.length || api.endpoints?.length || 0} tools
          </Badge>
          <button
            onClick={handleExpand}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary">
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDiscover} disabled={discovering}>
                {discovering ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <Search size={14} className="mr-2" />
                )}
                Discover Endpoints
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteConfirmOpen(true)}
                className="text-danger"
              >
                <Trash2 size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {expanded && (
          <div className="border-t border-border bg-bg-primary/50 px-4 py-3">
            <div className="mb-2 text-[10px] font-medium uppercase text-text-muted">
              Discovered Tools ({tools.length})
            </div>
            {loadingTools ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-text-muted" />
              </div>
            ) : tools.length === 0 ? (
              <p className="text-xs text-text-muted">
                No tools discovered yet. Click &quot;Discover Endpoints&quot; to start.
              </p>
            ) : (
              <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2.5"
                  >
                    <Badge
                      variant="outline"
                      className={`mt-0.5 shrink-0 text-[9px] font-mono ${
                        tool.method === "GET"
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : tool.method === "POST"
                          ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                          : tool.method === "PUT"
                          ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                          : "border-red-500/40 text-red-400 bg-red-500/10"
                      }`}
                    >
                      {tool.method}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-medium text-text-primary">
                        {tool.name}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                        {tool.description}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-text-muted">
                        {tool.path}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm bg-bg-secondary">
          <DialogHeader>
            <DialogTitle>Delete Custom API</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-text-primary font-medium">{api.name}</span>?
              This will remove all discovered tools.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ──────────────────────── Add MCP Modal ──────────────────────── */

function AddMCPModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { addConnector } = useChatStore()
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState("")
  const [serverName, setServerName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [connecting, setConnecting] = useState(false)

  const reset = () => {
    setStep(1)
    setUrl("")
    setServerName("")
    setApiKey("")
    setConnecting(false)
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleConnect = () => {
    setConnecting(true)
    setTimeout(() => {
      addConnector({
        id: Date.now().toString(),
        name: serverName || extractName(url),
        type: "mcp",
        url,
        status: "connected",
        authType: "api_key",
        tools: [],
      })
      setConnecting(false)
      handleClose(false)
    }, 1200)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Connect to an MCP server to extend agent capabilities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-text-secondary">Server Name (optional)</label>
            <Input
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Auto-detected from URL"
              className="mt-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">MCP Server URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className="mt-1.5 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary">API Key (optional)</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key if required"
              className="mt-1.5 font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={!url || connecting}>
            {connecting ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : null}
            {connecting ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ──────────────────────── Add Custom API Modal ──────────────────────── */

function AddCustomAPIModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setName("")
    setImage(null)
    setApiKey("")
    setBaseUrl("")
    setCreating(false)
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!name) return
    setCreating(true)
    try {
      await createConnector(name, image || undefined, apiKey || undefined, baseUrl || undefined)
      onCreated()
      handleClose(false)
    } catch {
      // Error handled by API
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-bg-secondary">
        <DialogHeader>
          <DialogTitle>Add Custom API</DialogTitle>
          <DialogDescription>
            Enter a name and optional API key. The agent will discover endpoints automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Logo upload */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => logoInputRef.current?.click()}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-bg-primary transition-colors hover:border-accent/50 hover:bg-bg-hover group"
            >
              {image ? (
                <>
                  <img
                    src={image}
                    alt="API logo"
                    className="h-full w-full rounded-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Upload size={16} className="text-white" />
                  </div>
                </>
              ) : (
                <Upload size={18} className="text-text-muted group-hover:text-accent" />
              )}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div>
              <div className="text-xs text-text-secondary">API Logo</div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                Optional. Square image recommended.
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API"
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Base URL (optional)</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="mt-1.5 font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">API Key (optional)</label>
            <div className="relative mt-1.5">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
                className="pl-8 font-mono text-sm"
              />
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              Encrypted and stored securely. Used for endpoint discovery.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || creating}>
            {creating ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : null}
            {creating ? "Adding..." : "Add API"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function extractName(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const parts = hostname.replace("mcp.", "").split(".")
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return "New Server"
  }
}
