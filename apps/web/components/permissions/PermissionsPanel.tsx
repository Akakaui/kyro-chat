"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Settings2, Check, HelpCircle, X, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import type { PermissionLevel } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import {
  getPermissions,
  setGlobalPermission,
  setToolPermission,
  resetToolPermission,
  type ToolPermissionGlobals,
  type ToolPermission,
} from "@/lib/api"

// Built-in tools list
const BUILTIN_TOOLS = [
  { name: "read_file", description: "Read file contents from workspace" },
  { name: "write_file", description: "Write content to a file" },
  { name: "edit_file", description: "Edit a file by replacing text" },
  { name: "list_files", description: "List files and directories" },
  { name: "search_files", description: "Search for files by pattern" },
  { name: "run_code", description: "Execute code in sandbox" },
  { name: "run_bash", description: "Execute shell commands" },
  { name: "search_knowledge", description: "Search knowledge base" },
  { name: "search_web", description: "Search the web" },
  { name: "browse_web", description: "Fetch web page content" },
  { name: "delegate_to_agent", description: "Delegate to sub-agent" },
  { name: "create_artifact", description: "Create artifacts" },
  { name: "list_artifacts", description: "List artifacts" },
  { name: "search_memory", description: "Search memory" },
  { name: "save_memory", description: "Save to memory" },
]

export function PermissionsPanel() {
  const {
    permissionsPanelOpen,
    permissionsPanelConnectorId,
    connectors,
    setPermissionsPanelOpen,
    toolPermissions,
    globalPermissions,
    setToolPermissionState,
    setGlobalPermissionState,
    loadPermissions,
  } = useChatStore()

  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    globals: true,
    builtin: true,
    mcp: false,
    custom_api: false,
  })

  useEffect(() => {
    if (permissionsPanelOpen) {
      loadPermissionsData()
    }
  }, [permissionsPanelOpen])

  const loadPermissionsData = async () => {
    try {
      setLoading(true)
      await loadPermissions()
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleGlobalChange = async (sourceType: string, permission: PermissionLevel) => {
    try {
      await setGlobalPermission(sourceType, permission)
      setGlobalPermissionState(sourceType, permission)
    } catch {
      // Error handled by API
    }
  }

  const handleToolChange = async (toolName: string, source: string, permission: PermissionLevel) => {
    try {
      await setToolPermission(toolName, source, permission)
      setToolPermissionState(toolName, permission)
    } catch {
      // Error handled by API
    }
  }

  const handleResetTool = async (toolName: string) => {
    try {
      await resetToolPermission(toolName)
      const { [toolName]: _, ...rest } = toolPermissions
      useChatStore.setState({ toolPermissions: rest })
    } catch {
      // Error handled by API
    }
  }

  if (!permissionsPanelOpen) return null

  const mcpTools = connectors
    .filter((c) => c.type === "mcp" && c.tools)
    .flatMap((c) => (c.tools || []).map((t) => ({ ...t, source: "mcp", connectorName: c.name, connectorId: c.id })))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPermissionsPanelOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Permissions</h3>
            <p className="text-xs text-text-muted">
              Control tool access for the agent
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadPermissionsData}>
          <RefreshCw size={14} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Global Defaults */}
          <Section
            title="Global Defaults"
            expanded={expandedSections.globals}
            onToggle={() => toggleSection("globals")}
          >
            <div className="space-y-2">
              <PermissionRow
                label="All Built-in Tools"
                permission={globalPermissions.builtin}
                onChange={(p) => handleGlobalChange("builtin", p)}
                isGlobal
              />
              <PermissionRow
                label="All MCP Tools"
                permission={globalPermissions.mcp}
                onChange={(p) => handleGlobalChange("mcp", p)}
                isGlobal
              />
              <PermissionRow
                label="All Custom APIs"
                permission={globalPermissions.custom_api}
                onChange={(p) => handleGlobalChange("custom_api", p)}
                isGlobal
              />
            </div>
          </Section>

          {/* Built-in Tools */}
          <Section
            title="Built-in Tools"
            expanded={expandedSections.builtin}
            onToggle={() => toggleSection("builtin")}
            count={BUILTIN_TOOLS.length}
          >
            <div className="space-y-1.5">
              {BUILTIN_TOOLS.map((tool) => (
                <ToolPermissionRow
                  key={tool.name}
                  toolName={tool.name}
                  description={tool.description}
                  source="builtin"
                  permission={toolPermissions[tool.name]}
                  globalDefault={globalPermissions.builtin}
                  onChange={(p) => handleToolChange(tool.name, "builtin", p)}
                  onReset={() => handleResetTool(tool.name)}
                />
              ))}
            </div>
          </Section>

          {/* MCP Tools */}
          {mcpTools.length > 0 && (
            <Section
              title="MCP Tools"
              expanded={expandedSections.mcp}
              onToggle={() => toggleSection("mcp")}
              count={mcpTools.length}
            >
              <div className="space-y-1.5">
                {mcpTools.map((tool) => (
                  <ToolPermissionRow
                    key={`${tool.connectorId}-${tool.name}`}
                    toolName={tool.name}
                    description={tool.description}
                    source="mcp"
                    permission={toolPermissions[tool.name]}
                    globalDefault={globalPermissions.mcp}
                    onChange={(p) => handleToolChange(tool.name, "mcp", p)}
                    onReset={() => handleResetTool(tool.name)}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────── Section ──────────────────────── */

function Section({
  title,
  expanded,
  onToggle,
  count,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-bg-hover"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase text-text-muted">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] text-text-muted">
              {count}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
      </button>
      {expanded && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  )
}

/* ──────────────────────── Permission Row ──────────────────────── */

function PermissionRow({
  label,
  permission,
  onChange,
  isGlobal,
}: {
  label: string
  permission: PermissionLevel
  onChange: (p: PermissionLevel) => void
  isGlobal?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-bg-primary px-3 py-2">
      <span className="text-sm text-text-primary">{label}</span>
      <div className="flex gap-1">
        <PermissionButton
          active={permission === "allow"}
          onClick={() => onChange("allow")}
          variant="allow"
        />
        <PermissionButton
          active={permission === "ask"}
          onClick={() => onChange("ask")}
          variant="ask"
        />
        <PermissionButton
          active={permission === "deny"}
          onClick={() => onChange("deny")}
          variant="deny"
        />
      </div>
    </div>
  )
}

/* ──────────────────────── Tool Permission Row ──────────────────────── */

function ToolPermissionRow({
  toolName,
  description,
  source,
  permission,
  globalDefault,
  onChange,
  onReset,
}: {
  toolName: string
  description: string
  source: string
  permission?: PermissionLevel
  globalDefault: PermissionLevel
  onChange: (p: PermissionLevel) => void
  onReset: () => void
}) {
  const effectivePermission = permission || globalDefault
  const isOverridden = !!permission

  return (
    <div className="rounded-lg border border-border bg-bg-primary px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-medium text-text-primary">{toolName}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">{description}</div>
          {isOverridden && (
            <button
              onClick={onReset}
              className="mt-1 flex items-center gap-1 text-[10px] text-accent hover:underline"
            >
              <RefreshCw size={10} />
              Reset to global default ({globalDefault})
            </button>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <PermissionButton
            active={effectivePermission === "allow"}
            onClick={() => onChange("allow")}
            variant="allow"
            size="sm"
          />
          <PermissionButton
            active={effectivePermission === "ask"}
            onClick={() => onChange("ask")}
            variant="ask"
            size="sm"
          />
          <PermissionButton
            active={effectivePermission === "deny"}
            onClick={() => onChange("deny")}
            variant="deny"
            size="sm"
          />
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────── Permission Button ──────────────────────── */

function PermissionButton({
  active,
  onClick,
  variant,
  size = "md",
}: {
  active: boolean
  onClick: () => void
  variant: "allow" | "ask" | "deny"
  size?: "sm" | "md"
}) {
  const variants = {
    allow: {
      active: "bg-success/20 border-success text-success",
      inactive: "border-success/30 text-success/50 hover:bg-success/10",
      icon: <Check size={size === "sm" ? 10 : 12} />,
    },
    ask: {
      active: "bg-accent/20 border-accent text-accent",
      inactive: "border-accent/30 text-accent/50 hover:bg-accent/10",
      icon: <HelpCircle size={size === "sm" ? 10 : 12} />,
    },
    deny: {
      active: "bg-danger/20 border-danger text-danger",
      inactive: "border-danger/30 text-danger/50 hover:bg-danger/10",
      icon: <X size={size === "sm" ? 10 : 12} />,
    },
  }

  const v = variants[variant]
  const sizeClass = size === "sm" ? "h-6 w-6" : "h-7 w-7"

  return (
    <button
      onClick={onClick}
      className={`flex ${sizeClass} items-center justify-center rounded-md border transition-all ${
        active ? v.active : v.inactive
      }`}
      title={variant.charAt(0).toUpperCase() + variant.slice(1)}
    >
      {v.icon}
    </button>
  )
}

/* ──────────────────────── Global Permissions Section (for sidebar) ──────────────────────── */

export function GlobalPermissionsSection() {
  const { defaultPermission, setDefaultPermission } = useChatStore()

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-text-muted">
        <Settings2 size={12} />
        Default Permission
      </h3>
      <div className="space-y-2">
        {(
          [
            {
              key: "strict" as const,
              label: "Strict",
              desc: "Read = Allow, Write/Bash = Ask, everything else = Ask",
            },
            {
              key: "permissive" as const,
              label: "Permissive",
              desc: "Read/Write = Allow, Bash = Ask, everything else = Allow",
            },
            {
              key: "custom" as const,
              label: "Custom",
              desc: "Define permissions per tool in each connector",
            },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            onClick={() => setDefaultPermission(option.key)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
              defaultPermission === option.key
                ? "border-accent/50 bg-accent/10"
                : "border-border bg-bg-secondary hover:bg-bg-hover"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {option.label}
              </span>
              {defaultPermission === option.key && (
                <div className="h-2 w-2 rounded-full bg-accent" />
              )}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">{option.desc}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
