"use client"

import React, { useRef, useEffect, useCallback } from "react"
import {
  Plus,
  Mic,
  Send,
  Loader2,
  X,
  FileText,
  Image,
  Shield,
  ShieldCheck,
  Users,
  Wrench,
  Hammer,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { SlashCommands, type SlashCommand, SLASH_COMMANDS } from "./SlashCommands"
import {
  MentionPopup,
  type MentionItem,
  type MentionAgent,
  type MentionKB,
} from "./MentionPopup"

export interface AttachedFile {
  name: string
  type: string
  size: number
  preview?: string
}

interface ChatInputProps {
  onFilesSelect?: (files: AttachedFile[]) => void
  attachedFiles?: AttachedFile[]
  onRemoveFile?: (index: number) => void
  activeTools?: { name: string; status: "running" | "done" | "error" }[]
  taskBadge?: React.ReactNode
}

export function ChatInput({ onFilesSelect, attachedFiles = [], onRemoveFile, activeTools = [], taskBadge }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    selectedModel,
    isStreaming,
    chatMode,
    setChatMode,
    acceptAll,
    toggleAcceptAll,
    setAddToChatOverlayOpen,
    setModelSelectorOpen,
    skills,
    agents,
    knowledgeBases,
    mentionArtifacts,
    connectors,
    fetchSkills,
    fetchAgents,
    fetchKnowledgeBases,
    fetchMentionArtifacts,
  } = useChatStore()

  const [value, setValue] = React.useState("")

  // Fetch dynamic data on mount
  React.useEffect(() => {
    fetchSkills()
    fetchAgents()
    fetchKnowledgeBases()
    fetchMentionArtifacts()
  }, [fetchSkills, fetchAgents, fetchKnowledgeBases, fetchMentionArtifacts])

  // Popup state
  const [showSlashMenu, setShowSlashMenu] = React.useState(false)
  const [showMentionPopup, setShowMentionPopup] = React.useState(false)
  const [slashFilter, setSlashFilter] = React.useState("")
  const [mentionFilter, setMentionFilter] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [selectedCommand, setSelectedCommand] = React.useState<string | null>(null)
  const [showPlusMenu, setShowPlusMenu] = React.useState(false)

  const slashFilteredCount = React.useMemo(() => {
    if (!showSlashMenu) return 0
    const q = slashFilter.toLowerCase().replace(/^\//, "")
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.command.toLowerCase().includes(q) ||
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
    ).length
  }, [showSlashMenu, slashFilter])

  // Transform dynamic data for MentionPopup
  const mentionAgents: MentionAgent[] = React.useMemo(() => {
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description || "",
      avatarColor: "#339af0",
      initials: a.name.slice(0, 1).toUpperCase(),
    }))
  }, [agents])

  const mentionKBs: MentionKB[] = React.useMemo(() => {
    return knowledgeBases.map((kb) => ({
      id: kb.kb_id,
      name: kb.source_file,
      documentCount: kb.chunk_count,
    }))
  }, [knowledgeBases])

  const mentionMcpServers = React.useMemo(() => {
    return connectors
      .filter((c) => c.type === "mcp")
      .map((c) => ({
        id: c.id,
        name: c.name,
        connected: c.status === "connected",
      }))
  }, [connectors])

  React.useEffect(() => {
    const max = showSlashMenu ? slashFilteredCount : showMentionPopup ? 20 : 0
    if (selectedIndex >= max && max > 0) {
      setSelectedIndex(max - 1)
    }
  }, [selectedIndex, slashFilteredCount, showSlashMenu, showMentionPopup])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  const detectTriggers = useCallback(
    (text: string, insertedChar?: string) => {
      const lastChar = insertedChar ?? text.slice(-1)
      const beforeCursor = text

      const slashMatch = beforeCursor.match(/(?:^|\s)\/([^\s]*)$/)
      if (slashMatch && (lastChar === "/" || slashMatch[1].length > 0)) {
        setShowSlashMenu(true)
        setSlashFilter("/" + slashMatch[1])
        setSelectedIndex(0)
        setShowMentionPopup(false)
        setShowPlusMenu(false)
        return
      }

      const atMatch = beforeCursor.match(/(?:^|\s)@([^\s]*)$/)
      if (atMatch && (lastChar === "@" || atMatch[1].length > 0)) {
        setShowMentionPopup(true)
        setMentionFilter("@" + atMatch[1])
        setSelectedIndex(0)
        setShowSlashMenu(false)
        setShowPlusMenu(false)
        return
      }

      setShowSlashMenu(false)
      setShowMentionPopup(false)
    },
    []
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      const insertedChar = newValue.length > value.length ? newValue.slice(-1) : undefined
      setValue(newValue)
      detectTriggers(newValue, insertedChar)
    },
    [value, detectTriggers]
  )

  const closePopups = useCallback(() => {
    setShowSlashMenu(false)
    setShowMentionPopup(false)
    setSlashFilter("")
    setMentionFilter("")
    setSelectedIndex(0)
    setSelectedCommand(null)
    setShowPlusMenu(false)
  }, [])

  const handleSlashSelect = useCallback(
    (command: SlashCommand) => {
      const newValue = value.replace(/(?:^|\s)\/[^\s]*$/, "").trimEnd()
      const newText = newValue ? newValue + " " + command.command + " " : command.command + " "
      setValue(newText)
      setSelectedCommand(command.command)
      closePopups()
      textareaRef.current?.focus()
    },
    [value, closePopups]
  )

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      const name = item.type === "agent" ? item.agent.name : item.kb.name
      const newValue = value.replace(/(?:^|\s)@[^\s]*$/, "").trimEnd()
      const newText = newValue ? newValue + " @" + name + " " : "@" + name + " "
      setValue(newText)
      closePopups()
      textareaRef.current?.focus()
    },
    [value, closePopups]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList || fileList.length === 0) return

      const newFiles: AttachedFile[] = []
      Array.from(fileList).forEach((file) => {
        const entry: AttachedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
        }
        if (file.type.startsWith("image/")) {
          entry.preview = URL.createObjectURL(file)
        }
        newFiles.push(entry)
      })

      if (newFiles.length > 0) {
        onFilesSelect?.([...attachedFiles, ...newFiles])
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setShowPlusMenu(false)
    },
    [attachedFiles, onFilesSelect]
  )

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isStreaming) return
    window.dispatchEvent(
      new CustomEvent("kyro:send-message", {
        detail: { content: value.trim(), files: attachedFiles },
      })
    )
    setValue("")
    setSelectedCommand(null)
    closePopups()
    if (onFilesSelect) onFilesSelect([])
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }, [value, isStreaming, closePopups, attachedFiles, onFilesSelect])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isSlashOpen = showSlashMenu
      const isMentionOpen = showMentionPopup

      if (isSlashOpen || isMentionOpen) {
        const listLength = isSlashOpen ? slashFilteredCount : 20

        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % Math.max(listLength, 1))
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + Math.max(listLength, 1)) % Math.max(listLength, 1))
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          if (isSlashOpen) {
            const q = slashFilter.toLowerCase().replace(/^\//, "")
            const filtered = SLASH_COMMANDS.filter(
              (cmd) =>
                cmd.command.toLowerCase().includes(q) ||
                cmd.label.toLowerCase().includes(q) ||
                cmd.description.toLowerCase().includes(q)
            )
            if (filtered[selectedIndex]) handleSlashSelect(filtered[selectedIndex])
          }
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          closePopups()
          return
        }
        if (e.key === " ") {
          closePopups()
          return
        }
        if (e.key === "Tab") {
          e.preventDefault()
          if (isSlashOpen) {
            const q = slashFilter.toLowerCase().replace(/^\//, "")
            const filtered = SLASH_COMMANDS.filter(
              (cmd) =>
                cmd.command.toLowerCase().includes(q) ||
                cmd.label.toLowerCase().includes(q) ||
                cmd.description.toLowerCase().includes(q)
            )
            if (filtered[selectedIndex]) handleSlashSelect(filtered[selectedIndex])
          }
          return
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [showSlashMenu, showMentionPopup, slashFilteredCount, selectedIndex, slashFilter, handleSlashSelect, closePopups, handleSubmit]
  )

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="safe-bottom border-t border-border bg-bg-primary px-3 py-3 md:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />

          {showSlashMenu && (
            <SlashCommands
              filter={slashFilter}
              selectedIndex={selectedIndex}
              onSelect={handleSlashSelect}
              onHover={setSelectedIndex}
              skills={skills}
            />
          )}

          {showMentionPopup && (
            <MentionPopup
              filter={mentionFilter}
              selectedIndex={selectedIndex}
              onSelect={handleMentionSelect}
              onHover={setSelectedIndex}
              agents={mentionAgents}
              kbs={mentionKBs}
              artifacts={mentionArtifacts}
              mcpServers={mentionMcpServers}
            />
          )}

          {/* Attached files chips */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {attachedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary px-2.5 py-1.5 text-xs"
                >
                  {file.preview ? (
                    <img src={file.preview} alt={file.name} className="h-5 w-5 shrink-0 rounded object-cover" />
                  ) : (
                    <FileText size={14} className="shrink-0 text-text-muted" />
                  )}
                  <span className="max-w-[120px] truncate text-text-secondary">{file.name}</span>
                  <span className="text-text-muted">{formatFileSize(file.size)}</span>
                  <button
                    onClick={() => onRemoveFile?.(i)}
                    className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Task badge — shows task progress during streaming */}
          {taskBadge && <div className="mb-2">{taskBadge}</div>}

          {/* Task progress display — shows active tools during streaming */}
          {isStreaming && activeTools.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {activeTools.map((tool, i) => (
                <div
                  key={`${tool.name}-${i}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    tool.status === "running"
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : tool.status === "done"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-danger/30 bg-danger/10 text-danger"
                  )}
                >
                  {tool.status === "running" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : tool.status === "done" ? (
                    <span className="text-[10px]">&#10003;</span>
                  ) : (
                    <X size={10} />
                  )}
                  <span className="font-medium">{tool.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-bg-secondary p-2 md:gap-2">
            {/* Plus button — menu for files + attachments */}
            <div className="relative">
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Plus size={20} className={cn("transition-transform duration-200", showPlusMenu && "rotate-45")} />
              </button>

              {showPlusMenu && (
                <div className="context-menu absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Image size={20} className="text-cyan" />
                    Upload image
                  </button>
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = ".pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx"
                        fileInputRef.current.click()
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <FileText size={20} className="text-purple" />
                    Upload file
                  </button>
                  <button
                    onClick={() => {
                      setAddToChatOverlayOpen(true)
                      setShowPlusMenu(false)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Plus size={20} className="text-accent" />
                    Add knowledge base
                  </button>
                </div>
              )}
            </div>

            {/* Model selector pill */}
            <button
              onClick={() => setModelSelectorOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {selectedModel.name}
            </button>

            {/* Act / Build mode switcher */}
            <div className="flex shrink-0 overflow-hidden rounded-full border border-border bg-bg-tertiary">
              <button
                onClick={() => setChatMode("act")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                  chatMode === "act"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Wrench size={14} />
                Act
              </button>
              <button
                onClick={() => setChatMode("build")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                  chatMode === "build"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Hammer size={14} />
                Build
              </button>
            </div>

            {/* Accept All permissions */}
            <button
              onClick={toggleAcceptAll}
              title={acceptAll ? "Accept all permissions: ON" : "Accept all permissions: OFF"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                acceptAll
                  ? "bg-success/15 text-success"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              {acceptAll ? <ShieldCheck size={20} /> : <Shield size={20} />}
            </button>

            {/* Delegate to sub-agent */}
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("kyro:open-delegate"))
              }}
              title="Delegate to sub-agent"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Users size={20} />
            </button>

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />

            {/* Mic button */}
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">
              <Mic size={20} />
            </button>

            {/* Send button */}
            <Button
              onClick={handleSubmit}
              disabled={!value.trim() || isStreaming}
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0 rounded-lg",
                value.trim() && !isStreaming
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "bg-bg-tertiary text-text-muted"
              )}
            >
              {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
