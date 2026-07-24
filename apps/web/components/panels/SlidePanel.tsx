"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Settings,
  Trash2,
  Clock,
  PanelLeftClose,
  History,
  Folder,
  FolderOpen,
  FolderPlus,
  Star,
  MessageSquare,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import {
  useConversations,
  useDeleteConversation,
} from "@/lib/hooks"
import {
  listProjects,
  createProject,
  updateConversation,
  listProjectConversations,
  type Project,
  type Conversation,
} from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

function formatRelativeTime(timestamp?: number | string): string {
  if (!timestamp) return ""
  const time = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime()
  if (isNaN(time)) return ""
  const now = Date.now()
  const diffSec = Math.floor((now - time) / 1000)

  if (diffSec < 60) return "now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 30) return `${diffDays}d`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears}y`
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </div>
  )
}

export function SlidePanel() {
  const {
    panelOpen,
    setPanelOpen,
    activeConversation,
    setActiveConversation,
    setMessages,
    setSettingsPanelOpen,
  } = useChatStore()

  const conversationsQuery = useConversations()
  const deleteConversation = useDeleteConversation()
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [projectConversations, setProjectConversations] = useState<Record<string, Conversation[]>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [query, setQuery] = useState("")

  const allConversations: Conversation[] = conversationsQuery.data || []

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const res = await listProjects()
      setProjects(res.projects || [])
    } catch {
      setProjects([])
    }
  }

  const handleToggleProject = async (id: string) => {
    const willExpand = !expandedProjects[id]
    setExpandedProjects((prev) => ({ ...prev, [id]: willExpand }))
    if (willExpand && !projectConversations[id]) {
      try {
        const res = await listProjectConversations(id)
        setProjectConversations((prev) => ({ ...prev, [id]: res.conversations || [] }))
      } catch {
        setProjectConversations((prev) => ({ ...prev, [id]: [] }))
      }
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      const p = await createProject(newProjectName.trim())
      setProjects((prev) => [p, ...prev])
    } catch {
      const newP: Project = { id: `proj-${Date.now()}`, name: newProjectName.trim(), created_at: Date.now() }
      setProjects((prev) => [newP, ...prev])
    } finally {
      setNewProjectName("")
      setCreatingProject(false)
    }
  }

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null)
      return
    }
    try {
      await updateConversation(id, { title: editTitle.trim() })
      conversationsQuery.refetch()
    } catch {
      // Silent fail
    } finally {
      setEditingId(null)
    }
  }

  const startNewConversation = () => {
    setActiveConversation(null)
    setMessages([])
    setPanelOpen(false)
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? allConversations.filter((c) => c.title?.toLowerCase().includes(q))
    : allConversations
  const pinnedConversations = filtered.filter((c) => c.starred)
  const regularConversations = filtered.filter((c) => !c.starred)

  if (!panelOpen) return null

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={() => setPanelOpen(false)}
      />

      {/* Sidebar Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col shrink-0 select-none",
          "bg-bg-secondary border-r border-border text-text-secondary",
          "transition-transform duration-200 ease-in-out",
          "md:relative md:translate-x-0",
          panelOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 pl-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <span className="text-sm font-bold text-white">K</span>
            </div>
            <span className="text-sm font-semibold text-text-primary tracking-tight">Kyro</span>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            title="Close sidebar"
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* New conversation */}
        <div className="p-3 pb-2">
          <button
            onClick={startNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
            <span>New conversation</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-primary px-2.5 py-2 focus-within:border-border-hover transition-colors">
            <Search size={14} className="text-text-muted shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"
            />
          </div>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-5 py-2">
            {/* Quick links */}
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveConversation(null)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left"
              >
                <History size={16} className="text-text-muted shrink-0" />
                <span>Conversation history</span>
              </button>
              <button
                onClick={() => setActiveConversation(null)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left"
              >
                <Clock size={16} className="text-text-muted shrink-0" />
                <span>Scheduled tasks</span>
              </button>
            </div>

            {/* Pinned */}
            {pinnedConversations.length > 0 && (
              <div className="space-y-1">
                <SectionLabel>Pinned</SectionLabel>
                <div className="space-y-0.5">
                  {pinnedConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveConversation(conv.id)
                        setPanelOpen(false)
                      }}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                        activeConversation === conv.id
                          ? "bg-bg-active text-accent font-medium"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      )}
                    >
                      <Star size={13} className="shrink-0 fill-current text-accent" />
                      <span className="truncate flex-1">{conv.title}</span>
                      <span className="text-[10px] text-text-muted shrink-0">
                        {formatRelativeTime(conv.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <SectionLabel>Projects</SectionLabel>
                <button
                  onClick={() => setCreatingProject((v) => !v)}
                  title="New project"
                  aria-label="New project"
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <FolderPlus size={15} />
                </button>
              </div>

              {creatingProject && (
                <div className="px-2">
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject()
                      if (e.key === "Escape") {
                        setCreatingProject(false)
                        setNewProjectName("")
                      }
                    }}
                    onBlur={() => {
                      if (!newProjectName.trim()) setCreatingProject(false)
                    }}
                    placeholder="Project name..."
                    className="w-full rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                  />
                </div>
              )}

              {projects.length === 0 && !creatingProject ? (
                <p className="px-3 py-1.5 text-xs text-text-muted">No projects yet</p>
              ) : (
                <div className="space-y-0.5">
                  {projects.map((proj) => {
                    const isExpanded = !!expandedProjects[proj.id]
                    const convs = projectConversations[proj.id] || []
                    return (
                      <div key={proj.id}>
                        <button
                          onClick={() => handleToggleProject(proj.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left"
                        >
                          {isExpanded ? (
                            <FolderOpen size={15} className="text-accent shrink-0" />
                          ) : (
                            <Folder size={15} className="text-text-muted shrink-0" />
                          )}
                          <span className="truncate flex-1 font-medium">{proj.name}</span>
                        </button>
                        {isExpanded && (
                          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                            {convs.length === 0 ? (
                              <p className="px-2 py-1 text-[11px] text-text-muted">No conversations yet</p>
                            ) : (
                              convs.map((conv) => (
                                <button
                                  key={conv.id}
                                  onClick={() => {
                                    setActiveConversation(conv.id)
                                    setPanelOpen(false)
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors text-left",
                                    activeConversation === conv.id
                                      ? "bg-bg-active text-accent font-medium"
                                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                                  )}
                                >
                                  <MessageSquare size={12} className="shrink-0" />
                                  <span className="truncate flex-1">{conv.title}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Conversations */}
            <div className="space-y-1">
              <SectionLabel>Conversations</SectionLabel>
              <div className="space-y-0.5">
                {regularConversations.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-text-muted">
                    {q ? "No matches found" : "No conversations yet"}
                  </p>
                ) : (
                  regularConversations.map((conv) => {
                    const isEditing = editingId === conv.id
                    if (isEditing) {
                      return (
                        <div key={conv.id} className="px-2 py-1">
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(conv.id)
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            onBlur={() => handleRename(conv.id)}
                            className="w-full rounded-md border border-accent/60 bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none"
                          />
                        </div>
                      )
                    }
                    return (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setActiveConversation(conv.id)
                          setPanelOpen(false)
                        }}
                        onDoubleClick={() => {
                          setEditingId(conv.id)
                          setEditTitle(conv.title)
                        }}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                          activeConversation === conv.id
                            ? "bg-bg-active text-accent font-medium"
                            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        )}
                      >
                        <span className="truncate flex-1">{conv.title}</span>
                        <span className="text-[10px] text-text-muted shrink-0 group-hover:hidden">
                          {formatRelativeTime(conv.updated_at)}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConversation.mutate(conv.id)
                          }}
                          title="Delete conversation"
                          className="hidden group-hover:flex items-center justify-center p-0.5 text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 size={13} />
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={() => setSettingsPanelOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <Settings size={16} className="text-text-muted" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
