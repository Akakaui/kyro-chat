"use client"

import { useState } from "react"
import {
  Calendar,
  Plus,
  CheckCircle,
  Clock,
  ChevronRight,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

interface ScheduledTask {
  id: string
  title: string
  schedule: string
  lastRun: string
  nextRun: string
  status: "active" | "paused" | "completed"
  projectId?: string
  permissionOverride?: boolean
  emailNotification?: boolean
}

const mockTasks: ScheduledTask[] = [
  {
    id: "1",
    title: "Generate weekly report",
    schedule: "Every Monday at 9:00 AM",
    lastRun: "Jul 14, 9:00 AM",
    nextRun: "Jul 21, 9:00 AM",
    status: "active",
    projectId: "proj_abc",
    permissionOverride: false,
    emailNotification: true,
  },
  {
    id: "2",
    title: "Check competitor pricing",
    schedule: "Every Wednesday at 2:00 PM",
    lastRun: "Jul 16, 2:00 PM",
    nextRun: "Jul 23, 2:00 PM",
    status: "active",
    emailNotification: true,
  },
  {
    id: "3",
    title: "Summarize new GitHub issues",
    schedule: "Every Friday at 5:00 PM",
    lastRun: "Jul 12, 5:00 PM",
    nextRun: "Jul 19, 5:00 PM",
    status: "paused",
    emailNotification: false,
  },
]

const mockProjects = [
  { id: "proj_abc", name: "Product Roadmap" },
  { id: "proj_def", name: "Marketing Ops" },
  { id: "proj_ghi", name: "Dev Sprint" },
]

export function ScheduledPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>(mockTasks)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [filterProject, setFilterProject] = useState<string>("all")
  const [formData, setFormData] = useState({
    title: "",
    prompt: "",
    schedule: "",
    projectId: "",
    permissionOverride: false,
    emailNotification: true,
  })

  const filteredTasks =
    filterProject === "all"
      ? tasks
      : tasks.filter((t) => t.projectId === filterProject)

  function resetForm() {
    setFormData({
      title: "",
      prompt: "",
      schedule: "",
      projectId: "",
      permissionOverride: false,
      emailNotification: true,
    })
    setEditingTask(null)
    setShowForm(false)
  }

  function handleSubmit() {
    if (!formData.title.trim() || !formData.prompt.trim()) return

    if (editingTask) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? {
                ...t,
                title: formData.title,
                schedule: formData.schedule || "Custom schedule",
                projectId: formData.projectId || undefined,
                permissionOverride: formData.permissionOverride,
                emailNotification: formData.emailNotification,
              }
            : t
        )
      )
    } else {
      const newTask: ScheduledTask = {
        id: String(Date.now()),
        title: formData.title,
        schedule: formData.schedule || "Custom schedule",
        lastRun: "Never",
        nextRun: "Pending",
        status: "active",
        projectId: formData.projectId || undefined,
        permissionOverride: formData.permissionOverride,
        emailNotification: formData.emailNotification,
      }
      setTasks((prev) => [...prev, newTask])
    }
    resetForm()
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  function toggleStatus(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "active" ? "paused" : "active" }
          : t
      )
    )
  }

  function startEdit(task: ScheduledTask) {
    setFormData({
      title: task.title,
      prompt: "",
      schedule: task.schedule,
      projectId: task.projectId || "",
      permissionOverride: task.permissionOverride || false,
      emailNotification: task.emailNotification ?? true,
    })
    setEditingTask(task)
    setShowForm(true)
  }

  // Form view
  if (showForm) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <button
            onClick={resetForm}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-text-primary">
            {editingTask ? "Edit Task" : "New Task"}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Task Name</label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g., Weekly report"
                className="h-9 text-sm"
              />
            </div>

            {/* Prompt */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                What should the agent do?
              </label>
              <Textarea
                value={formData.prompt}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, prompt: e.target.value }))
                }
                placeholder="Describe the task in natural language..."
                rows={4}
                className="resize-none text-sm"
              />
            </div>

            {/* Schedule */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Schedule</label>
              <div className="grid grid-cols-2 gap-2">
                {["Daily", "Weekly", "Monthly", "Custom"].map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, schedule: s }))
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs transition-colors",
                      formData.schedule === s
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-border bg-bg-secondary text-text-secondary hover:border-text-muted"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Project assignment */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Project (optional)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, projectId: "" }))
                  }
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs transition-colors",
                    !formData.projectId
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-border bg-bg-secondary text-text-secondary hover:border-text-muted"
                  )}
                >
                  No project
                </button>
                {mockProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, projectId: p.id }))
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs transition-colors",
                      formData.projectId === p.id
                        ? "border-accent bg-accent/5 text-accent"
                        : "border-border bg-bg-secondary text-text-secondary hover:border-text-muted"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Permission override */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Shield size={14} className="text-text-secondary" />
                  <p className="text-sm text-text-primary">Skip confirmations</p>
                </div>
                <p className="text-[11px] text-text-muted">
                  Auto-approve tool calls for this task
                </p>
              </div>
              <Switch
                checked={formData.permissionOverride}
                onCheckedChange={(v) =>
                  setFormData((prev) => ({ ...prev, permissionOverride: v }))
                }
              />
            </div>

            {/* Email notification */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Mail size={14} className="text-text-secondary" />
                  <p className="text-sm text-text-primary">Email notification</p>
                </div>
                <p className="text-[11px] text-text-muted">
                  Get notified when task completes
                </p>
              </div>
              <Switch
                checked={formData.emailNotification}
                onCheckedChange={(v) =>
                  setFormData((prev) => ({ ...prev, emailNotification: v }))
                }
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!formData.title.trim() || !formData.prompt.trim()}
            >
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Task detail / list view
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">Scheduled Tasks</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-accent hover:text-accent"
          onClick={() => setShowForm(true)}
        >
          <Plus size={14} />
          New
        </Button>
      </div>

      {/* Project filter */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <button
          onClick={() => setFilterProject("all")}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
            filterProject === "all"
              ? "bg-accent/15 text-accent"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          All
        </button>
        {mockProjects.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilterProject(p.id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
              filterProject === p.id
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle size={24} className="mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No scheduled tasks</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div key={task.id} className="px-3 py-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {task.title}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          task.status === "active"
                            ? "bg-green-500/15 text-green-500"
                            : task.status === "paused"
                              ? "bg-yellow-500/15 text-yellow-500"
                              : "bg-text-muted/15 text-text-muted"
                        )}
                      >
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">{task.schedule}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        Last: {task.lastRun}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle size={10} />
                        Next: {task.nextRun}
                      </span>
                    </div>
                    {(task.projectId || task.permissionOverride || task.emailNotification) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {task.projectId && (
                          <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                            {mockProjects.find((p) => p.id === task.projectId)?.name || task.projectId}
                          </span>
                        )}
                        {task.permissionOverride && (
                          <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-500">
                            Skip confirm
                          </span>
                        )}
                        {task.emailNotification && (
                          <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                            Email notify
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => toggleStatus(task.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
                    >
                      {task.status === "active" ? "⏸" : "▶"}
                    </button>
                    <button
                      onClick={() => startEdit(task)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-accent"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
