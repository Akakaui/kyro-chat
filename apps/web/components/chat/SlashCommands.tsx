"use client"

import React, { useEffect, useRef, useMemo } from "react"
import {
  Globe,
  BookOpen,
  Users,
  Code,
  Monitor,
  Mail,
  Clock,
  Brain,
  Trash2,
  Download,
  HelpCircle,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Skill } from "@/lib/api"

export interface SlashCommand {
  command: string
  label: string
  description: string
  icon: LucideIcon
  shortcut?: string
  category?: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/search", label: "Search the web", description: "Search the web", icon: Globe, shortcut: "/" },
  { command: "/skill", label: "Load Skill", description: "Load a skill file into context", icon: BookOpen, category: "tools" },
  { command: "/kb", label: "Knowledge base", description: "Search knowledge base", icon: BookOpen },
  { command: "/agent", label: "Sub-agent", description: "Delegate to sub-agent", icon: Users },
  { command: "/code", label: "Run code", description: "Run code", icon: Code, shortcut: "⌘K" },
  { command: "/browser", label: "Browser", description: "Open browser", icon: Monitor },
  { command: "/email", label: "Email", description: "Check email", icon: Mail },
  { command: "/schedule", label: "Schedule", description: "Schedule task", icon: Clock },
  { command: "/memory", label: "Memory", description: "Search memory", icon: Brain },
  { command: "/clear", label: "Clear", description: "Clear conversation", icon: Trash2 },
  { command: "/export", label: "Export", description: "Export conversation", icon: Download },
  { command: "/help", label: "Help", description: "Show commands", icon: HelpCircle, shortcut: "?" },
]

interface SlashCommandsProps {
  filter: string
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
  skills?: Skill[]
}

export function SlashCommands({
  filter,
  selectedIndex,
  onSelect,
  onHover,
  skills = [],
}: SlashCommandsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Merge built-in commands with dynamic skills
  const allCommands = useMemo(() => {
    const skillCommands: SlashCommand[] = skills.map((s) => ({
      command: `/skill:${s.name.toLowerCase().replace(/\s+/g, "-")}`,
      label: s.name,
      description: s.description || "User skill",
      icon: Zap,
      category: "Skills",
    }))
    return [...SLASH_COMMANDS, ...skillCommands]
  }, [skills])

  const filtered = allCommands.filter((cmd) => {
    const query = filter.toLowerCase().replace(/^\//, "")
    return (
      cmd.command.toLowerCase().includes(query) ||
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query)
    )
  })

  // Scroll selected item into view
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
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
            No matching commands
          </div>
        ) : (
          filtered.map((cmd, i) => {
            const Icon = cmd.icon
            const isSelected = i === selectedIndex
            return (
              <button
                key={cmd.command}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "bg-bg-hover"
                    : "hover:bg-bg-hover"
                )}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(cmd)}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0",
                    isSelected ? "text-accent" : "text-text-muted"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{cmd.label}</div>
                  <div className="text-xs text-text-muted">{cmd.description}</div>
                </div>
                {cmd.shortcut && (
                  <span className="shrink-0 text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
