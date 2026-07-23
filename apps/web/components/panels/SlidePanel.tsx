"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Settings,
  Star,
  Trash2,
  Clock,
  PanelLeftClose,
  ArrowLeft,
  ArrowRight,
  History,
  Folder,
  FolderOpen,
  FolderPlus,
  SlidersHorizontal,
  MoreHorizontal,
  Pencil,
  Archive,
  ChevronDown,
  ChevronRight,
  MessageSquare,
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

export function SlidePanel() {
  const {
    panelOpen,
    setPanelOpen,
    activeConversation,
    setActiveConversation,
    setMessages,
    setSettingsPanelOpen,
    selectedProjectId,
    setSelectedProjectId,
  } = useChatStore()

  const conversationsQuery = useConversations()
  const deleteConversation = useDeleteConversation()
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    "kyro-chat": true,
  })
  const [projectConversations, setProjectConversations] = useState<Record<string, Conversation[]>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [activeTab, setActiveTab] = useState<"history" | "scheduled" | "chats">("chats")
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")

  const allConversations: Conversation[] = conversationsQuery.data || []

  // Default default projects list if backend has no projects yet
  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const res = await listProjects()
      if (res.projects && res.projects.length > 0) {
        setProjects(res.projects)
      } else {
        // Fallback default sample project structures matching workspace
        setProjects([
          { id: "kyro-chat", name: "kyro chat", created_at: Date.now() },
          { id: "akaka-portfolio", name: "c:\\Users\\Owner\\akaka-portf...", created_at: Date.now() - 86400000 * 5 },
          { id: "akaka", name: "akaka", created_at: Date.now() - 86400000 * 10 },
          { id: "klin", name: "klin", created_at: Date.now() - 86400000 * 12 },
          { id: "design-main", name: "design--main", created_at: Date.now() - 86400000 * 15 },
          { id: "vartex-portfolio", name: "vartex-architects-portfolio", created_at: Date.now() - 86400000 * 20 },
          { id: "users-owner", name: "C:\\Users\\Owner", created_at: Date.now() - 86400000 * 30 },
          { id: "gemini-anti", name: "c:\\Users\\Owner\\.gemini\\anti...", created_at: Date.now() - 86400000 * 40 },
        ])
      }
    } catch {
      setProjects([
        { id: "kyro-chat", name: "kyro chat", created_at: Date.now() },
        { id: "akaka-portfolio", name: "c:\\Users\\Owner\\akaka-portf...", created_at: Date.now() - 86400000 * 5 },
        { id: "akaka", name: "akaka", created_at: Date.now() - 86400000 * 10 },
        { id: "klin", name: "klin", created_at: Date.now() - 86400000 * 12 },
        { id: "design-main", name: "design--main", created_at: Date.now() - 86400000 * 15 },
        { id: "vartex-portfolio", name: "vartex-architects-portfolio", created_at: Date.now() - 86400000 * 20 },
        { id: "users-owner", name: "C:\\Users\\Owner", created_at: Date.now() - 86400000 * 30 },
        { id: "gemini-anti", name: "c:\\Users\\Owner\\.gemini\\anti...", created_at: Date.now() - 86400000 * 40 },
      ])
    }
  }

  const handleToggleProject = (id: string) => {
    setExpandedProjects((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      const p = await createProject(newProjectName.trim())
      setProjects((prev) => [p, ...prev])
      setNewProjectName("")
      setCreatingProject(false)
    } catch {
      // Fallback local create
      const newP: Project = { id: `proj-${Date.now()}`, name: newProjectName.trim(), created_at: Date.now() }
      setProjects((prev) => [newP, ...prev])
      setNewProjectName("")
      setCreatingProject(false)
    }
  }

  const handleToggleStar = async (id: string, currentStarred?: boolean) => {
    try {
      await updateConversation(id, { starred: !currentStarred })
      conversationsQuery.refetch()
    } catch {
      // Silent fail
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

  const pinnedConversations = allConversations.filter((c) => c.starred)
  const regularConversations = allConversations.filter((c) => !c.starred)

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
        style={{
          background: "#0f0f12",
          borderRight: "1px solid #1a1a20",
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col transition-transform duration-200 ease-in-out shrink-0 text-gray-200 select-none",
          "md:relative md:translate-x-0",
          panelOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Top Bar: [|]  ←  → */}
        <div className="flex h-12 items-center justify-between px-3 border-b border-[#18181f] shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPanelOpen(false)}
              title="Close sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#181820] hover:text-gray-100 transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
            <button
              onClick={() => window.history.back()}
              title="Go back"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#181820] hover:text-gray-100 transition-colors"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              onClick={() => window.history.forward()}
              title="Go forward"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#181820] hover:text-gray-100 transition-colors"
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <ScrollArea className="flex-1 px-3 py-3">
          <div className="space-y-4">
            {/* Primary Action: + New Conversation */}
            <div>
              <button
                onClick={() => {
                  setActiveConversation(null)
                  setMessages([])
                  setActiveTab("chats")
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[#262630] bg-[#16161d] px-3.5 py-2 text-xs font-semibold text-gray-100 transition-all hover:border-[#3b3b4a] hover:bg-[#1c1c26] shadow-sm"
              >
                <Plus size={15} className="text-gray-300" />
                <span>New Conversation</span>
              </button>
            </div>

            {/* Top items: Conversation History & Scheduled Tasks */}
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left",
                  activeTab === "history"
                    ? "bg-[#1f1f2a] text-gray-100 font-semibold"
                    : "text-gray-300 hover:bg-[#16161e] hover:text-gray-100"
                )}
              >
                <History size={15} className="text-gray-400" />
                <span>Conversation History</span>
              </button>

              <button
                onClick={() => setActiveTab("scheduled")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left",
                  activeTab === "scheduled"
                    ? "bg-[#1f1f2a] text-gray-100 font-semibold"
                    : "text-gray-300 hover:bg-[#16161e] hover:text-gray-100"
                )}
              >
                <Clock size={15} className="text-gray-400" />
                <span>Scheduled Tasks</span>
              </button>
            </div>

            {/* Pinned Conversations Section */}
            <div>
              <div className="mb-1.5 px-3 text-[11px] font-medium text-gray-400 tracking-tight">
                Pinned Conversations
              </div>
              {pinnedConversations.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-gray-400">
                  Act as an expert Systems Ar... <span className="float-right text-[10px]">2mo</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {pinnedConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveConversation(conv.id)
                        setPanelOpen(false)
                      }}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors text-left",
                        activeConversation === conv.id
                          ? "bg-[#1f1f2a] text-amber-400 font-semibold"
                          : "text-gray-300 hover:bg-[#16161e] hover:text-gray-100"
                      )}
                    >
                      <span className="truncate flex-1 pr-2">{conv.title}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {formatRelativeTime(conv.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Projects Section */}
            <div>
              <div className="mb-2 flex items-center justify-between px-3">
                <span className="text-[11px] font-medium text-gray-400 tracking-tight">
                  Projects
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    title="Filter projects"
                    className="text-gray-400 hover:text-gray-200 transition-colors p-0.5"
                  >
                    <SlidersHorizontal size={13} />
                  </button>
                  <button
                    onClick={() => setCreatingProject(!creatingProject)}
                    title="New project"
                    className="text-gray-400 hover:text-gray-200 transition-colors p-0.5"
                  >
                    <FolderPlus size={14} />
                  </button>
                </div>
              </div>

              {/* Inline Create Project Input */}
              {creatingProject && (
                <div className="mb-2 px-2 flex items-center gap-1">
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject()
                      if (e.key === "Escape") setCreatingProject(false)
                    }}
                    placeholder="Project name..."
                    className="w-full bg-[#181822] border border-[#2a2a38] text-xs text-gray-100 rounded-md px-2 py-1 outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Project Folders Tree */}
              <div className="space-y-0.5">
                {projects.map((proj) => {
                  const isExpanded = !!expandedProjects[proj.id]
                  const hasChats = activeConversation && proj.id === "kyro-chat"

                  return (
                    <div key={proj.id} className="space-y-0.5">
                      <button
                        onClick={() => handleToggleProject(proj.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 hover:bg-[#16161e] hover:text-gray-100 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <FolderOpen size={14} className="text-gray-400 shrink-0" />
                        ) : (
                          <Folder size={14} className="text-gray-400 shrink-0" />
                        )}
                        <span className="truncate flex-1 font-medium">{proj.name}</span>
                      </button>

                      {/* Project Sub-Items */}
                      {isExpanded && (
                        <div className="pl-5 space-y-0.5">
                          {proj.id === "kyro-chat" ? (
                            <button
                              onClick={() => {
                                if (allConversations.length > 0) {
                                  setActiveConversation(allConversations[0].id)
                                }
                              }}
                              className="flex w-full items-center justify-between rounded-lg bg-[#22222d] border border-[#333342] px-3 py-1.5 text-xs font-medium text-gray-100 shadow-sm"
                            >
                              <span className="truncate flex-1 pr-2">
                                {activeConversation
                                  ? allConversations.find((c) => c.id === activeConversation)?.title || "Addressing Responsive ..."
                                  : "Addressing Responsive ..."}
                              </span>
                              <span className="text-[10px] text-gray-400 shrink-0">now</span>
                            </button>
                          ) : (
                            <div className="px-3 py-1 text-[11px] text-gray-400 italic">
                              No conversations yet
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Conversations Section */}
            <div>
              <div className="mb-1.5 px-3 text-[11px] font-medium text-gray-400 tracking-tight">
                Conversations
              </div>
              <div className="space-y-0.5">
                {regularConversations.length === 0 ? (
                  <>
                    <div className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-gray-300 hover:bg-[#16161e] hover:text-gray-100 transition-colors cursor-pointer">
                      <span className="truncate flex-1 pr-2">Accessing GitHub CLI Tools</span>
                      <MoreHorizontal size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-gray-300 hover:bg-[#16161e] hover:text-gray-100 transition-colors cursor-pointer">
                      <span className="truncate flex-1 pr-2">Setting Up AI Animation No...</span>
                      <span className="text-[10px] text-gray-400 shrink-0">15d</span>
                    </div>
                  </>
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
                            className="w-full bg-[#181822] border border-amber-500/50 text-xs text-gray-100 rounded-md px-2 py-1 outline-none"
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
                        className={cn(
                          "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors text-left",
                          activeConversation === conv.id
                            ? "bg-[#1f1f2a] text-amber-400 font-semibold"
                            : "text-gray-300 hover:bg-[#16161e] hover:text-gray-100"
                        )}
                      >
                        <span className="truncate flex-1 pr-2">{conv.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-gray-400 group-hover:hidden">
                            {formatRelativeTime(conv.updated_at)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteConversation.mutate(conv.id)
                            }}
                            title="Delete"
                            className="hidden group-hover:flex p-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Sticky Footer: ⚙ Settings */}
        <div className="p-3 border-t border-[#18181f] shrink-0">
          <button
            onClick={() => setSettingsPanelOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-300 hover:bg-[#16161e] hover:text-gray-100 transition-colors"
          >
            <Settings size={15} className="text-gray-400" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
