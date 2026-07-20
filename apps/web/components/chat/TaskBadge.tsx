"use client"

import React from "react"
import { Loader2, CheckCircle, AlertCircle, ListTodo } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TaskInfo {
  id: string
  name: string
  status: "running" | "done" | "error"
}

interface TaskBadgeProps {
  tasks: TaskInfo[]
  className?: string
}

export function TaskBadge({ tasks, className }: TaskBadgeProps) {
  if (tasks.length === 0) return null

  const running = tasks.filter((t) => t.status === "running").length
  const completed = tasks.filter((t) => t.status === "done").length
  const errors = tasks.filter((t) => t.status === "error").length

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1.5",
        className
      )}
    >
      <ListTodo size={12} className="text-text-muted" />
      <div className="flex items-center gap-1.5 text-[11px]">
        {running > 0 && (
          <span className="flex items-center gap-1 text-accent">
            <Loader2 size={10} className="animate-spin" />
            {running} running
          </span>
        )}
        {completed > 0 && (
          <span className="flex items-center gap-1 text-success">
            <CheckCircle size={10} />
            {completed} done
          </span>
        )}
        {errors > 0 && (
          <span className="flex items-center gap-1 text-danger">
            <AlertCircle size={10} />
            {errors} failed
          </span>
        )}
      </div>
    </div>
  )
}
