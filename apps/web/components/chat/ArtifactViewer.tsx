"use client"

import {
  X,
  Copy,
  Check,
  Download,
  Printer,
  Share2,
  Eye,
  Code,
  Table,
  FileText,
  Play,
  Save,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

function getActionsForType(type: string): string[] {
  switch (type) {
    case "html":
    case "react":
      return ["preview", "code", "copy", "download"]
    case "markdown":
      return ["preview", "copy", "download", "print", "share"]
    case "pdf":
      return ["download", "print", "share"]
    case "mermaid":
      return ["preview", "download"]
    case "csv":
      return ["table", "copy", "copyMarkdown", "download", "saveImage"]
    case "video":
      return ["play", "download"]
    case "image":
      return ["preview", "download", "share"]
    default:
      return ["copy", "download"]
  }
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
  variant = "default",
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  variant?: "default" | "primary" | "danger"
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        variant === "primary" && "bg-accent/15 text-accent hover:bg-accent/25",
        variant === "danger" && "text-danger hover:bg-danger/15",
        variant === "default" && !active && "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        active && "bg-success/15 text-success"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function ArtifactViewer() {
  const { activeArtifact, artifactViewerOpen, setArtifactViewerOpen } = useChatStore()
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<"preview" | "code" | "table">("preview")
  const [showShareMenu, setShowShareMenu] = useState(false)

  if (!artifactViewerOpen || !activeArtifact) return null

  const content = activeArtifact.content || ""
  const type = activeArtifact.type
  const actions = getActionsForType(type)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyMarkdown = async () => {
    if (type === "csv") {
      const rows = content.split("\n").filter(Boolean)
      const md = rows.map((r) => `| ${r.replace(/,/g, " | ")} |`).join("\n")
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = activeArtifact.url || url
    a.download = activeArtifact.title
    a.click()
    if (!activeArtifact.url) URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(`<html><head><title>${activeArtifact.title}</title></head><body><pre>${content}</pre></body></html>`)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const handleShare = (permission: "anyone" | "only-you") => {
    setShowShareMenu(false)
    if (navigator.share && activeArtifact.url) {
      navigator.share({ title: activeArtifact.title, url: activeArtifact.url })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setArtifactViewerOpen(false)}
      />

      {/* Viewer */}
      <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {activeArtifact.title}
            </h3>
            <span className="rounded-md bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium uppercase text-text-muted">
              {activeArtifact.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Context-sensitive actions */}
            {actions.includes("preview") && (
              <ActionButton
                icon={viewMode === "preview" ? <Code size={14} /> : <Eye size={14} />}
                label={viewMode === "preview" ? "Code" : "Preview"}
                onClick={() => setViewMode(viewMode === "preview" ? "code" : "preview")}
                variant="primary"
              />
            )}
            {actions.includes("code") && (
              <ActionButton
                icon={<Code size={14} />}
                label="Code"
                onClick={() => setViewMode("code")}
                active={viewMode === "code"}
              />
            )}
            {actions.includes("table") && (
              <ActionButton
                icon={<Table size={14} />}
                label="Table"
                onClick={() => setViewMode("table")}
                active={viewMode === "table"}
              />
            )}
            {actions.includes("play") && (
              <ActionButton
                icon={<Play size={14} />}
                label="Play"
                onClick={() => {}}
                variant="primary"
              />
            )}
            {actions.includes("copy") && (
              <ActionButton
                icon={copied ? <Check size={14} /> : <Copy size={14} />}
                label={copied ? "Copied" : "Copy"}
                onClick={handleCopy}
                active={copied}
              />
            )}
            {actions.includes("copyMarkdown") && (
              <ActionButton
                icon={copied ? <Check size={14} /> : <FileText size={14} />}
                label={copied ? "Copied" : "Markdown"}
                onClick={handleCopyMarkdown}
                active={copied}
              />
            )}
            {actions.includes("download") && (
              <ActionButton
                icon={<Download size={14} />}
                label="Export"
                onClick={handleDownload}
              />
            )}
            {actions.includes("print") && (
              <ActionButton
                icon={<Printer size={14} />}
                label="Print"
                onClick={handlePrint}
              />
            )}
            {actions.includes("share") && (
              <div className="relative">
                <ActionButton
                  icon={<Share2 size={14} />}
                  label="Share"
                  onClick={() => setShowShareMenu(!showShareMenu)}
                />
                {showShareMenu && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl">
                    <button
                      onClick={() => handleShare("anyone")}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      Anyone with link
                    </button>
                    <button
                      onClick={() => handleShare("only-you")}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      Only you
                    </button>
                  </div>
                )}
              </div>
            )}
            {actions.includes("saveImage") && (
              <ActionButton
                icon={<Save size={14} />}
                label="Save"
                onClick={handleDownload}
              />
            )}

            {/* Close */}
            <button
              onClick={() => setArtifactViewerOpen(false)}
              className="ml-1 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {type === "html" || type === "react" ? (
            viewMode === "preview" ? (
              <iframe
                srcDoc={content}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-forms"
                title={activeArtifact.title}
              />
            ) : (
              <pre className="p-6 font-mono text-xs leading-relaxed text-text-primary">
                <code>{content}</code>
              </pre>
            )
          ) : type === "image" ? (
            <div className="flex h-full items-center justify-center p-6">
              {activeArtifact.url ? (
                <img
                  src={activeArtifact.url}
                  alt={activeArtifact.title}
                  className="max-h-full rounded-lg object-contain"
                />
              ) : (
                <span className="text-text-muted">Image preview unavailable</span>
              )}
            </div>
          ) : type === "video" ? (
            <div className="flex h-full items-center justify-center p-6">
              {activeArtifact.url ? (
                <video
                  src={activeArtifact.url}
                  controls
                  className="max-h-full rounded-lg"
                />
              ) : (
                <span className="text-text-muted">Video preview unavailable</span>
              )}
            </div>
          ) : type === "csv" && viewMode === "table" ? (
            <div className="p-6">
              <table className="w-full text-sm">
                <thead>
                  {content.split("\n")[0]?.split(",").map((h, i) => (
                    <th key={i} className="border-b border-border px-3 py-2 text-left font-medium text-text-secondary">
                      {h.trim()}
                    </th>
                  ))}
                </thead>
                <tbody>
                  {content.split("\n").slice(1).filter(Boolean).map((row, ri) => (
                    <tr key={ri}>
                      {row.split(",").map((cell, ci) => (
                        <td key={ci} className="border-b border-border px-3 py-2 text-text-primary">
                          {cell.trim()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="p-6 font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap">
              <code>{content}</code>
            </pre>
          )}
        </div>
      </div>
    </>
  )
}
