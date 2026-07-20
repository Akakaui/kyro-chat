"use client"

import { useState } from "react"
import {
  MessageSquare,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
  BookOpen,
  Clock,
  Mail,
  Layers,
  FileCode2,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { useConversations, useDeleteConversation } from "@/lib/hooks"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { KnowledgeBasePanel } from "@/components/kb/KnowledgeBasePanel"
import { ScheduledPanel } from "@/components/scheduled/ScheduledPanel"
import { EmailPanel } from "@/components/email/EmailPanel"

type PanelView = "chats" | "projects" | "artifacts" | "kb" | "scheduled" | "email"

const mainTabs: { id: PanelView; label: string; icon: React.ReactNode }[] = [
  { id: "chats", label: "Chats", icon: <MessageSquare size={14} /> },
  { id: "projects", label: "Projects", icon: <Layers size={14} /> },
  { id: "artifacts", label: "Artifacts", icon: <FileCode2 size={14} /> },
  { id: "kb", label: "KB", icon: <BookOpen size={14} /> },
]

const moreOptions: { id: PanelView; label: string; icon: React.ReactNode }[] = [
  { id: "scheduled", label: "Scheduled", icon: <Clock size={14} /> },
  { id: "email", label: "Email", icon: <Mail size={14} /> },
]

export function SlidePanel() {
  const {
    panelOpen,
    setPanelOpen,
    activeConversation,
    setActiveConversation,
    setMessages,
    setSettingsPanelOpen,
  } = useChatStore()

  const [activeView, setActiveView] = useState<PanelView>("chats")
  const [moreOpen, setMoreOpen] = useState(false)
  const [search, setSearch] = useState("")
  const conversationsQuery = useConversations()
  const deleteConversation = useDeleteConversation()

  const allConversations = conversationsQuery.data || []
  const conversations = allConversations.filter(
    (c) => !search || c.title.toLowerCase().includes(search.toLowerCase())
  )

  if (!panelOpen) return null

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 z-30 bg-black/50 md:hidden"
        onClick={() => setPanelOpen(false)}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border bg-bg-primary transition-transform duration-300",
          "md:relative md:translate-x-0",
          panelOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-accent">K</span>
            <span className="text-sm font-semibold text-text-primary">Kyro</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsPanelOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => setPanelOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary md:hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-border px-1">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-colors",
                activeView === tab.id
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}

          {/* More dropdown */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium transition-colors",
                moreOptions.some((o) => o.id === activeView)
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              More
              <ChevronDown size={10} />
            </button>
            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-0.5 w-36 rounded-lg border border-border bg-bg-primary py-1 shadow-xl">
                  {moreOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setActiveView(opt.id)
                        setMoreOpen(false)
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        activeView === opt.id
                          ? "text-accent"
                          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        {activeView === "chats" ? (
          <>
            {/* New chat button */}
            <div className="p-3">
              <Button
                onClick={() => {
                  setActiveConversation(null)
                  setMessages([])
                  setPanelOpen(false)
                }}
                variant="outline"
                className="w-full justify-start gap-2 text-sm"
              >
                <Plus size={16} />
                New Chat
              </Button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="h-8 w-full rounded-lg border border-border bg-bg-secondary pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>
            </div>

            {/* Conversations list */}
            <ScrollArea className="flex-1 px-2">
              <div className="space-y-0.5 pb-4">
                {conversations.length === 0 ? (
                  <div className="py-8 text-center text-xs text-text-muted">
                    {search ? "No matches" : "No conversations yet"}
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveConversation(conv.id)
                        setPanelOpen(false)
                      }}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        activeConversation === conv.id
                          ? "bg-accent/10 text-accent"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      )}
                    >
                      <MessageSquare size={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                      {conv.starred && (
                        <Star
                          size={12}
                          className="shrink-0 fill-accent text-accent"
                        />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation.mutate(conv.id)
                        }}
                        className="hidden shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-red-400 group-hover:block"
                      >
                        <Trash2 size={12} />
                      </button>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        ) : activeView === "projects" ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
              <Layers size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-primary">Projects</p>
            <p className="mt-1 max-w-[200px] text-xs text-text-muted">
              Organize chats, artifacts, and knowledge bases into projects
            </p>
            <Button size="sm" className="mt-4 gap-1.5">
              <Plus size={14} />
              New Project
            </Button>
          </div>
        ) : activeView === "artifacts" ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
              <FileCode2 size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-primary">Artifacts</p>
            <p className="mt-1 max-w-[200px] text-xs text-text-muted">
              Code, documents, and other generated content
            </p>
          </div>
        ) : activeView === "kb" ? (
          <div className="flex-1 overflow-hidden">
            <KnowledgeBasePanel />
          </div>
        ) : activeView === "scheduled" ? (
          <div className="flex-1 overflow-hidden">
            <ScheduledPanel />
          </div>
        ) : activeView === "email" ? (
          <div className="flex-1 overflow-hidden">
            <EmailPanel />
          </div>
        ) : null}
      </div>
    </>
  )
}
