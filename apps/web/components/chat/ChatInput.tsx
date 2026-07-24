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
  Wrench,
  Hammer,
  MoreHorizontal,
  Globe,
  Search,
  Brain,
  ChevronDown,
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
  type MentionArtifact,
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
  taskBadge?: React.ReactNode
}

export function ChatInput({ onFilesSelect, attachedFiles = [], onRemoveFile, taskBadge }: ChatInputProps) {
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
    messages,
    connectors,
    fetchSkills,
    fetchAgents,
    fetchKnowledgeBases,
    browserEnabled,
    toggleBrowserEnabled,
    settings,
    toggleWebSearch,
  } = useChatStore()

  const [value, setValue] = React.useState("")

  // Fetch dynamic data on mount
  React.useEffect(() => {
    fetchSkills()
    fetchAgents()
    fetchKnowledgeBases()
  }, [fetchSkills, fetchAgents, fetchKnowledgeBases])

  // Popup state
  const [showSlashMenu, setShowSlashMenu] = React.useState(false)
  const [showMentionPopup, setShowMentionPopup] = React.useState(false)
  const [slashFilter, setSlashFilter] = React.useState("")
  const [mentionFilter, setMentionFilter] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [selectedCommand, setSelectedCommand] = React.useState<string | null>(null)
  const [showPlusMenu, setShowPlusMenu] = React.useState(false)
  const [showSecondaryMenu, setShowSecondaryMenu] = React.useState(false)

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

  // Derive artifacts from current conversation's messages instead of global
  const conversationArtifacts = React.useMemo(() => {
    const artifactMap = new Map<string, MentionArtifact>()
    for (const msg of messages) {
      if (msg.artifacts) {
        for (const a of msg.artifacts) {
          artifactMap.set(a.id, { id: a.id, name: a.title, type: a.type })
        }
      }
    }
    return Array.from(artifactMap.values())
  }, [messages])

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

  // Allow other components (e.g. empty-state suggestions) to prefill the composer
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail?.content === "string") {
        setValue(detail.content)
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (el) {
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
          }
        })
      }
    }
    window.addEventListener("kyro:prefill-input", handler)
    return () => window.removeEventListener("kyro:prefill-input", handler)
  }, [])

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
    setShowSecondaryMenu(false)
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
    <div
      style={{
        background: "#121212",
        borderTop: "1px solid #1e1e1e",
        padding: "12px 16px 16px",
      }}
      className="safe-area-inset-bottom"
    >
      <div style={{ maxWidth: "768px", margin: "0 auto" }}>
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
              artifacts={conversationArtifacts}
              mcpServers={mentionMcpServers}
            />
          )}

          {/* Attached files chips */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {attachedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 10px",
                    borderRadius: "8px",
                    border: "1px solid #2a2a2a",
                    background: "#1e1e1e",
                    flexShrink: 0,
                    fontSize: "12px",
                  }}
                >
                  {file.preview ? (
                    <img src={file.preview} alt={file.name} style={{ width: "18px", height: "18px", borderRadius: "4px", objectFit: "cover" }} />
                  ) : (
                    <FileText size={13} style={{ color: "#737373", flexShrink: 0 }} />
                  )}
                  <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#a3a3a3" }}>{file.name}</span>
                  <span style={{ color: "#4a4a4a" }}>{formatFileSize(file.size)}</span>
                  <button
                    onClick={() => onRemoveFile?.(i)}
                    style={{ color: "#737373", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", display: "flex" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#737373" }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Task badge */}
          {taskBadge && <div className="mb-2">{taskBadge}</div>}

          {/* Input bar — glassy premium multi-row container */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "18px",
              border: "1px solid #2a2a2a",
              background: "#181818",
              padding: "10px 12px 8px 12px",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.4)",
            }}
          >
            {/* Top row: Text input */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              style={{
                width: "100%",
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "2px 0 8px 0",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#ececec",
                maxHeight: "200px",
                minHeight: "44px",
                fontFamily: "inherit",
              }}
            />

            {/* Bottom toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "6px",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Left controls */}
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                {/* Plus button */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#a3a3a3",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = "#222"
                      el.style.color = "#ececec"
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = "transparent"
                      el.style.color = "#a3a3a3"
                    }}
                  >
                    <Plus size={18} className={cn("transition-transform duration-200", showPlusMenu && "rotate-45")} />
                  </button>

                  {showPlusMenu && (
                    <div className="context-menu absolute bottom-full left-0 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-bg-secondary p-1 shadow-xl z-50">
                      <button
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "*/*"
                            fileInputRef.current.click()
                          }
                          setShowPlusMenu(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <FileText size={16} className="text-accent" />
                        Add files or photos
                      </button>
                      <button
                        onClick={() => {
                          setShowSlashMenu(true)
                          setSlashFilter("skill")
                          setShowPlusMenu(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <Wrench size={16} className="text-warning" />
                        Quick access to Skills
                      </button>
                      <button
                        onClick={() => {
                          setAddToChatOverlayOpen(true)
                          setShowPlusMenu(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <Plus size={16} className="text-cyan" />
                        Add conversation to Project
                      </button>
                      <button
                        onClick={() => {
                          setShowMentionPopup(true)
                          setMentionFilter("mcp:")
                          setShowPlusMenu(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <Hammer size={16} className="text-success" />
                        Connectors & MCP
                      </button>
                      <div className="my-1 border-t border-border" />
                      <button
                        onClick={() => {
                          toggleWebSearch()
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <div className="flex items-center gap-2.5">
                          <Globe size={16} className={settings.capabilities.web_search ? "text-success" : "text-text-muted"} />
                          <span>Web Search</span>
                        </div>
                        <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded", settings.capabilities.web_search ? "bg-success/20 text-success" : "bg-bg-tertiary text-text-muted")}>
                          {settings.capabilities.web_search ? "ON" : "OFF"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Model selector pill */}
                <button
                  onClick={() => setModelSelectorOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                  style={{
                    borderRadius: "100px",
                    border: "1px solid #2a2a2a",
                    background: "#161616",
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "#a3a3a3",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    maxWidth: "40vw",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.borderColor = "rgba(217,119,6,0.4)"
                    el.style.color = "#d97706"
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.borderColor = "#2a2a2a"
                    el.style.color = "#a3a3a3"
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  <span className="truncate">{selectedModel.name}</span>
                  <ChevronDown size={12} style={{ color: "#737373", flexShrink: 0 }} />
                </button>

                {/* Act / Plan mode switcher */}
                <div
                  className="flex shrink-0"
                  style={{
                    borderRadius: "100px",
                    border: "1px solid #2a2a2a",
                    background: "#161616",
                    padding: "2px",
                  }}
                >
                  <button
                    onClick={() => setChatMode("act")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 9px",
                      borderRadius: "100px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: chatMode === "act" ? "#d97706" : "transparent",
                      color: chatMode === "act" ? "#ffffff" : "#737373",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Wrench size={11} />
                    Act
                  </button>
                  <button
                    onClick={() => setChatMode("build")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 9px",
                      borderRadius: "100px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: chatMode === "build" ? "#d97706" : "transparent",
                      color: chatMode === "build" ? "#ffffff" : "#737373",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Hammer size={11} />
                    Plan
                  </button>
                </div>
              </div>

              {/* Right controls */}
              <div className="flex shrink-0 items-center gap-1.5 pl-2">
                {/* Mic button */}
                <button
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#737373",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Mic size={16} />
                </button>

                {/* Send button */}
                <button
                  onClick={handleSubmit}
                  disabled={!value.trim() || isStreaming}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: value.trim() && !isStreaming
                      ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                      : "#262626",
                    border: "none",
                    color: value.trim() && !isStreaming ? "#ffffff" : "#525252",
                    cursor: value.trim() && !isStreaming ? "pointer" : "not-allowed",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isStreaming ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
