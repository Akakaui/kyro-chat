"use client"

import { useState } from "react"
import {
  ChevronDown,
  Check,
  X,
  Loader2,
  Hammer,
  BookOpen,
  Terminal,
  Globe,
  Bot,
  XCircle,
  FileSearch,
  Database,
  Code,
  Image,
  Brain,
  Search,
  FileEdit,
  TerminalSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolIndicatorProps {
  toolName: string
  source: "builtin" | "mcp" | "skill"
  mcpName?: string
  isLoading: boolean
  details?: string
  status?: "running" | "done" | "error"
  onCancel?: () => void
}

interface AgentStatusIndicatorProps {
  status: "idle" | "thinking" | "searching" | "browsing" | "writing_file" | "editing_file" | "running_command" | "sandbox_active"
  className?: string
}

function getServiceIcon(toolName: string) {
  const name = toolName.toLowerCase()
  if (name.includes("github") || name.includes("repo") || name.includes("pr") || name.includes("issue"))
    return <Hammer size={12} className="shrink-0" />
  if (name.includes("kb") || name.includes("knowledge") || name.includes("rag") || name.includes("retriev"))
    return <BookOpen size={12} className="shrink-0" />
  if (name.includes("code") || name.includes("exec") || name.includes("sandbox") || name.includes("terminal"))
    return <Terminal size={12} className="shrink-0" />
  if (name.includes("web") || name.includes("search") || name.includes("browse") || name.includes("fetch"))
    return <Globe size={12} className="shrink-0" />
  if (name.includes("file") || name.includes("read") || name.includes("write"))
    return <FileSearch size={12} className="shrink-0" />
  if (name.includes("database") || name.includes("db") || name.includes("query"))
    return <Database size={12} className="shrink-0" />
  if (name.includes("image") || name.includes("gen"))
    return <Image size={12} className="shrink-0" />
  if (name.includes("deploy") || name.includes("build"))
    return <Code size={12} className="shrink-0" />
  return <Bot size={12} className="shrink-0" />
}

function getStatusLabel(toolName: string, status: "running" | "done" | "error"): string {
  const name = toolName.toLowerCase()
  if (status === "done") return "done"
  if (status === "error") return "error"
  if (name.includes("web") || name.includes("search") || name.includes("browse")) return "web search"
  if (name.includes("delegate") || name.includes("agent")) return "delegating"
  if (name.includes("think") || name.includes("plan")) return "thinking"
  return "processing"
}

export function ToolIndicator({
  toolName,
  source,
  mcpName,
  isLoading,
  details,
  status,
  onCancel,
}: ToolIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  const resolvedStatus = status ?? (isLoading ? "running" : details ? "done" : "running")
  const statusLabel = getStatusLabel(toolName, resolvedStatus)

  return (
    <div className="mt-1.5 inline-block">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors",
          "border bg-bg-tertiary/80 backdrop-blur-sm",
          resolvedStatus === "running" && "text-accent border-accent/20",
          resolvedStatus === "done" && "text-success border-success/20",
          resolvedStatus === "error" && "text-danger border-danger/20",
          "hover:border-border-hover"
        )}
      >
        {/* Service icon */}
        {getServiceIcon(toolName)}

        {/* Status icon */}
        {resolvedStatus === "running" ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
        ) : resolvedStatus === "done" ? (
          <Check size={11} className="shrink-0 text-success" />
        ) : (
          <X size={11} className="shrink-0 text-danger" />
        )}

        {/* Tool name + status label */}
        <span className="font-medium">{toolName}</span>
        <span className="text-text-muted opacity-60">{statusLabel}</span>

        {/* Expand toggle when details exist */}
        {details && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            <ChevronDown
              size={10}
              className={cn(
                "shrink-0 text-text-muted transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
        )}

        {/* Cancel button for running tools */}
        {resolvedStatus === "running" && onCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
            className="flex shrink-0 items-center justify-center rounded p-0.5 text-text-muted transition-colors hover:bg-danger/15 hover:text-danger"
            title="Cancel task"
            aria-label={`Cancel ${toolName}`}
          >
            <XCircle size={12} />
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && details && (
        <div className="mt-1 rounded-lg border border-border bg-bg-primary/60 px-2.5 py-1.5 text-[10px] font-mono text-text-muted leading-relaxed backdrop-blur-sm">
          {details}
        </div>
      )}

      {/* Done summary — brief one-line result when tool completes */}
      {resolvedStatus === "done" && details && !expanded && (
        <div className="mt-0.5 px-1 text-[10px] text-text-muted truncate max-w-[300px]">
          {details.slice(0, 100)}
        </div>
      )}
    </div>
  )
}

export function AgentStatusIndicator({ status, className }: AgentStatusIndicatorProps) {
  if (status === "idle") return null

  const getStatusDisplay = () => {
    switch (status) {
      case "searching":
        return {
          icon: <Search size={12} className="shrink-0" />,
          text: "Searching the web",
          color: "text-accent border-accent/20",
        }
      case "browsing":
        return {
          icon: <Globe size={12} className="shrink-0" />,
          text: "Browsing website",
          color: "text-accent border-accent/20",
        }
      case "writing_file":
        return {
          icon: <FileEdit size={12} className="shrink-0" />,
          text: "Writing file",
          color: "text-accent border-accent/20",
        }
      case "editing_file":
        return {
          icon: <FileEdit size={12} className="shrink-0" />,
          text: "Editing file",
          color: "text-accent border-accent/20",
        }
      case "running_command":
        return {
          icon: <TerminalSquare size={12} className="shrink-0" />,
          text: "Running command",
          color: "text-accent border-accent/20",
        }
      case "sandbox_active":
        return {
          icon: <Terminal size={12} className="shrink-0" />,
          text: "Working in sandbox",
          color: "text-accent border-accent/20",
        }
      case "thinking":
      default:
        return {
          icon: <Brain size={12} className="shrink-0" />,
          text: "Thinking",
          color: "text-accent border-accent/20",
        }
    }
  }

  const { icon, text, color } = getStatusDisplay()

  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors",
      "border bg-bg-tertiary/80 backdrop-blur-sm",
      color,
      className
    )}>
      <Loader2 size={11} className="shrink-0 animate-spin" />
      {icon}
      <span className="font-medium">{text}...</span>
    </div>
  )
}
