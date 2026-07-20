"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Brain,
  Search,
  Trash2,
  RefreshCw,
  AlertCircle,
  Clock,
  Tag,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Memory {
  id: string
  userId: string
  agentId?: string
  type: "fact" | "preference" | "context" | "instruction"
  content: string
  metadata: Record<string, any>
  importance: number
  createdAt: number
  lastAccessedAt: number
  accessCount: number
}

const TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500/10 text-blue-400",
  preference: "bg-purple-500/10 text-purple-400",
  context: "bg-emerald-500/10 text-emerald-400",
  instruction: "bg-amber-500/10 text-amber-400",
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/memory/recent?limit=100", {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories || [])
      }
    } catch (err) {
      console.error("Failed to load memories:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        setDeletingId(id)
        const res = await fetch(`/api/memory/${id}`, {
          method: "DELETE",
          credentials: "include",
        })
        if (res.ok) {
          setMemories((prev) => prev.filter((m) => m.id !== id))
        }
      } catch (err) {
        console.error("Failed to delete memory:", err)
      } finally {
        setDeletingId(null)
      }
    },
    []
  )

  const filtered = memories.filter((m) => {
    if (filterType && m.type !== filterType) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return m.content.toLowerCase().includes(q)
    }
    return true
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return "Just now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  const types = ["fact", "preference", "context", "instruction"]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Memory Blocks
          </h3>
          <p className="text-xs text-text-muted">
            {memories.length} memories stored
          </p>
        </div>
        <button
          onClick={loadMemories}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          placeholder="Search memories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg-secondary py-2 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterType(null)}
          className={cn(
            "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            !filterType
              ? "bg-accent/15 text-accent"
              : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
          )}
        >
          All
        </button>
        {types.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(filterType === type ? null : type)}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-colors",
              filterType === type
                ? "bg-accent/15 text-accent"
                : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Memory list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={16} className="animate-spin text-text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Brain size={24} className="mb-2 text-text-muted" />
          <p className="text-xs text-text-secondary">
            {searchQuery || filterType
              ? "No matching memories"
              : "No memories stored yet"}
          </p>
          <p className="text-[10px] text-text-muted">
            Memories are created as you chat
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((memory) => (
            <div
              key={memory.id}
              className="group rounded-xl border border-border bg-bg-secondary p-3 transition-colors hover:border-border/80"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
                        TYPE_COLORS[memory.type] || "bg-bg-tertiary text-text-muted"
                      )}
                    >
                      {memory.type}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Clock size={10} />
                      {formatTime(memory.createdAt)}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Tag size={10} />
                      {memory.importance}/10
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {memory.content}
                  </p>
                  {memory.agentId && (
                    <p className="mt-1 text-[10px] text-text-muted">
                      Agent: {memory.agentId.slice(0, 8)}...
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(memory.id)}
                  disabled={deletingId === memory.id}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                >
                  {deletingId === memory.id ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
