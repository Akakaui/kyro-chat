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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import { useConversations, useDeleteConversation } from "@/lib/hooks"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

export function SlidePanel() {
  const {
    panelOpen,
    setPanelOpen,
    activeConversation,
    setActiveConversation,
    setMessages,
    setSettingsPanelOpen,
  } = useChatStore()

  const [search, setSearch] = useState("")
  const conversationsQuery = useConversations()
  const deleteConversation = useDeleteConversation()

  const allConversations = conversationsQuery.data || []
  const conversations = allConversations.filter(
    (c) =>
      !search || c.title.toLowerCase().includes(search.toLowerCase())
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
      </div>
    </>
  )
}
