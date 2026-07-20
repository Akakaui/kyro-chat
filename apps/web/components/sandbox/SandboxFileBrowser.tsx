"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  Download,
  ChevronRight,
  RefreshCw,
  X,
  Terminal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore, type SandboxFile } from "@/stores/chat"

function getFileIcon(file: SandboxFile) {
  if (file.isDirectory) return file.name ? FolderOpen : Folder
  const ext = file.name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return FileCode
    case "md":
    case "txt":
      return FileText
    default:
      return File
  }
}

interface FileTreeItemProps {
  file: SandboxFile
  level: number
  selectedPath: string | null
  onSelect: (file: SandboxFile) => void
  onToggleDir: (path: string) => void
  expandedDirs: Set<string>
}

function FileTreeItem({
  file,
  level,
  selectedPath,
  onSelect,
  onToggleDir,
  expandedDirs,
}: FileTreeItemProps) {
  const Icon = getFileIcon(file)
  const isExpanded = expandedDirs.has(file.path)

  return (
    <button
      onClick={() => {
        if (file.isDirectory) {
          onToggleDir(file.path)
        } else {
          onSelect(file)
        }
      }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm transition-colors",
        "hover:bg-bg-hover",
        selectedPath === file.path && "bg-accent/15 text-accent"
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      {file.isDirectory && (
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 text-text-muted transition-transform",
            isExpanded && "rotate-90"
          )}
        />
      )}
      <Icon size={14} className="shrink-0 text-text-secondary" />
      <span className="truncate text-text-primary">{file.name}</span>
      {file.size !== undefined && !file.isDirectory && (
        <span className="ml-auto text-[10px] text-text-muted">
          {file.size < 1024
            ? `${file.size}B`
            : file.size < 1024 * 1024
              ? `${Math.round(file.size / 1024)}KB`
              : `${Math.round(file.size / (1024 * 1024))}MB`}
        </span>
      )}
    </button>
  )
}

interface FileContentViewerProps {
  file: SandboxFile
  onClose: () => void
}

function FileContentViewer({ file, onClose }: FileContentViewerProps) {
  const [content, setContent] = useState<string>(file.content || "")
  const [loading, setLoading] = useState(!file.content)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (file.content) {
      setContent(file.content)
      setLoading(false)
      return
    }

    const loadContent = async () => {
      try {
        const response = await fetch(`/api/sandbox/files/${file.path}`)
        if (!response.ok) throw new Error("Failed to load file")
        const data = await response.json()
        setContent(data.content)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file")
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [file])

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/sandbox/download/${file.path}`)
      if (!response.ok) throw new Error("Failed to download file")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Download failed silently
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <File size={14} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">{file.name}</span>
          <span className="text-xs text-text-muted">{file.path}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw size={20} className="animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-danger">{error}</div>
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed text-text-primary">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

export function SandboxFileBrowser() {
  const {
    sandboxId,
    sandboxFiles,
    setSandboxFiles,
    sandboxFileViewerOpen,
    setSandboxFileViewerOpen,
    activeSandboxFile,
    setActiveSandboxFile,
  } = useChatStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    if (!sandboxId) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/sandbox/files/?path=/`)
      if (!response.ok) throw new Error("Failed to fetch files")
      const data = await response.json()
      setSandboxFiles(data.files || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch files")
    } finally {
      setLoading(false)
    }
  }, [sandboxId, setSandboxFiles])

  useEffect(() => {
    if (sandboxId && sandboxFileViewerOpen) {
      fetchFiles()
    }
  }, [sandboxId, sandboxFileViewerOpen, fetchFiles])

  const handleToggleDir = async (dirPath: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath)
    } else {
      newExpanded.add(dirPath)
      // Fetch directory contents
      try {
        const response = await fetch(`/api/sandbox/files/?path=${encodeURIComponent(dirPath)}`)
        if (!response.ok) throw new Error("Failed to fetch directory")
        const data = await response.json()
        // Update files with new children
        const updatedFiles = [...sandboxFiles]
        const dirIndex = updatedFiles.findIndex((f) => f.path === dirPath)
        if (dirIndex !== -1) {
          updatedFiles[dirIndex] = { ...updatedFiles[dirIndex], children: data.files }
        }
        setSandboxFiles(updatedFiles)
      } catch {
        // Silent fail
      }
    }
    setExpandedDirs(newExpanded)
  }

  const handleSelectFile = async (file: SandboxFile) => {
    setSelectedPath(file.path)
    try {
      const response = await fetch(`/api/sandbox/files/${file.path}`)
      if (!response.ok) throw new Error("Failed to load file")
      const data = await response.json()
      setActiveSandboxFile({ ...file, content: data.content })
      setSandboxFileViewerOpen(true)
    } catch {
      setActiveSandboxFile(file)
      setSandboxFileViewerOpen(true)
    }
  }

  const handleDownloadAll = async () => {
    try {
      const response = await fetch("/api/sandbox/download-all")
      if (!response.ok) throw new Error("Failed to download files")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "sandbox-files.zip"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Download failed silently
    }
  }

  if (!sandboxId) return null

  return (
    <>
      {/* Floating indicator */}
      <AnimatePresence>
        {!sandboxFileViewerOpen && sandboxId && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => {
              setSandboxFileViewerOpen(true)
              fetchFiles()
            }}
            className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full glass px-3 py-2 shadow-lg shadow-black/20 transition-colors hover:bg-white/10 md:bottom-8"
          >
            <Terminal size={14} className="text-accent" />
            <span className="text-xs font-medium text-text-primary">Files</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* File browser panel */}
      <AnimatePresence>
        {sandboxFileViewerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSandboxFileViewerOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 z-50 h-full w-80 border-l border-border bg-bg-primary shadow-2xl"
            >
              <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Terminal size={16} className="text-accent" />
                    <h3 className="text-sm font-semibold text-text-primary">Sandbox Files</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={fetchFiles}
                      disabled={loading}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                    </button>
                    <button
                      onClick={() => setSandboxFileViewerOpen(false)}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* File tree */}
                <div className="flex-1 overflow-auto">
                  {loading && sandboxFiles.length === 0 ? (
                    <div className="flex items-center justify-center p-8">
                      <RefreshCw size={20} className="animate-spin text-text-muted" />
                    </div>
                  ) : error ? (
                    <div className="p-4 text-sm text-danger">{error}</div>
                  ) : sandboxFiles.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                      No files yet. Files will appear as the agent creates them.
                    </div>
                  ) : (
                    <div className="p-2">
                      {sandboxFiles.map((file) => (
                        <FileTreeItem
                          key={file.path}
                          file={file}
                          level={0}
                          selectedPath={selectedPath}
                          onSelect={handleSelectFile}
                          onToggleDir={handleToggleDir}
                          expandedDirs={expandedDirs}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {sandboxFiles.length > 0 && (
                  <div className="border-t border-border px-4 py-3">
                    <button
                      onClick={handleDownloadAll}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-tertiary px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      <Download size={14} />
                      Download All as ZIP
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* File content viewer */}
      <AnimatePresence>
        {activeSandboxFile && sandboxFileViewerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60"
              onClick={() => setActiveSandboxFile(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary"
            >
              <FileContentViewer
                file={activeSandboxFile}
                onClose={() => setActiveSandboxFile(null)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
