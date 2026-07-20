"use client"

import React, { useEffect, useRef } from "react"
import { BookOpen, FileText, Server } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Skill, Agent, KbSource } from "@/lib/api"

export interface MentionAgent {
  id: string
  name: string
  description: string
  avatarColor: string
  initials: string
}

export interface MentionKB {
  id: string
  name: string
  documentCount: number
}

export interface MentionArtifact {
  id: string
  name: string
  type: string
}

export interface MentionMCPServer {
  id: string
  name: string
  connected: boolean
}

type MentionItem =
  | { type: "agent"; agent: MentionAgent }
  | { type: "kb"; kb: MentionKB }

function buildItems(
  filter: string,
  agents: MentionAgent[],
  kbs: MentionKB[]
): MentionItem[] {
  const q = filter.toLowerCase().replace(/^@/, "")
  const items: MentionItem[] = []

  const matchedAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
  )
  const matchedKBs = kbs.filter(
    (kb) =>
      kb.name.toLowerCase().includes(q) ||
      String(kb.documentCount).includes(q)
  )

  if (matchedAgents.length > 0) {
    matchedAgents.forEach((agent) => items.push({ type: "agent", agent }))
  }
  if (matchedKBs.length > 0) {
    matchedKBs.forEach((kb) => items.push({ type: "kb", kb }))
  }

  return items
}

interface MentionPopupProps {
  filter: string
  selectedIndex: number
  onSelect: (item: MentionItem) => void
  onHover: (index: number) => void
  agents?: MentionAgent[]
  kbs?: MentionKB[]
  artifacts?: MentionArtifact[]
  mcpServers?: MentionMCPServer[]
}

export function MentionPopup({
  filter,
  selectedIndex,
  onSelect,
  onHover,
  agents = [],
  kbs = [],
  artifacts = [],
  mcpServers = [],
}: MentionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const items = buildItems(filter, agents, kbs)

  const showAgentHeader =
    items.length > 0 && items[0].type === "agent"
  const showKBHeader =
    items.some((i) => i.type === "kb") &&
    (items[0]?.type === "kb" || items.some((i, idx) => i.type === "kb" && idx > 0 && items[idx - 1].type === "agent"))

  // Compute which items are "first" in their section for header rendering
  let lastType: string | null = null
  const sections: { item: MentionItem; showHeader: boolean }[] = items.map((item) => {
    const showHeader = item.type !== lastType
    lastType = item.type
    return { item, showHeader }
  })

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    if (item) {
      item.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-border bg-bg-secondary shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
            No matching results
          </div>
        ) : (
          sections.map(({ item, showHeader }, i) => {
            const isSelected = i === selectedIndex

            if (item.type === "agent") {
              return (
                <React.Fragment key={item.agent.id}>
                  {showHeader && (
                    <div className="text-[10px] uppercase font-medium text-text-muted px-3 py-1.5">
                      Agents
                    </div>
                  )}
                  <button
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      isSelected ? "bg-bg-hover" : "hover:bg-bg-hover"
                    )}
                    onMouseEnter={() => onHover(i)}
                    onClick={() => onSelect(item)}
                  >
                    <div
                      className="h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: item.agent.avatarColor }}
                    >
                      {item.agent.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">
                        {item.agent.name}
                      </div>
                      <div className="text-xs text-text-muted truncate">
                        {item.agent.description}
                      </div>
                    </div>
                  </button>
                </React.Fragment>
              )
            }

            return (
              <React.Fragment key={item.kb.id}>
                {showHeader && (
                  <div className="text-[10px] uppercase font-medium text-text-muted px-3 py-1.5">
                    Knowledge Bases
                  </div>
                )}
                <button
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    isSelected ? "bg-bg-hover" : "hover:bg-bg-hover"
                  )}
                  onMouseEnter={() => onHover(i)}
                  onClick={() => onSelect(item)}
                >
                  <BookOpen size={16} className="shrink-0 text-text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">
                      {item.kb.name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {item.kb.documentCount.toLocaleString()} documents
                    </div>
                  </div>
                </button>
              </React.Fragment>
            )
          })
        )}

        {/* Artifacts section */}
        {artifacts.length > 0 && (
          <div className="border-t border-border mt-1 pt-1">
            <div className="flex items-center gap-2 text-[10px] uppercase font-medium text-text-muted px-3 py-1.5">
              Artifacts
              <span className="bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded-full text-[9px]">
                {artifacts.length}
              </span>
            </div>
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
              >
                <FileText size={16} className="shrink-0 text-text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">
                    {artifact.name}
                  </div>
                  <div className="text-xs text-text-muted">{artifact.type}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MCP Servers section */}
        {mcpServers.length > 0 && (
          <div className="border-t border-border mt-1 pt-1">
            <div className="flex items-center gap-2 text-[10px] uppercase font-medium text-text-muted px-3 py-1.5">
              MCP Servers
              <span className="bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded-full text-[9px]">
                {mcpServers.length}
              </span>
            </div>
            {mcpServers.map((server) => (
              <div
                key={server.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
              >
                <Server size={16} className="shrink-0 text-text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">
                    {server.name}
                  </div>
                </div>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    server.connected ? "bg-green-500" : "bg-text-muted"
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export type { MentionItem }
