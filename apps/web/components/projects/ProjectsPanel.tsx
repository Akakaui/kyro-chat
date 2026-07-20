"use client"

import { useState, useEffect } from "react"
import {
  FolderOpen,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  MessageSquare,
  Database,
  X,
  Loader2,
} from "lucide-react"
import { createProject, listProjects, updateProject, deleteProject, Project } from "@/lib/api"
import { cn } from "@/lib/utils"

interface ProjectsPanelProps {
  onSelectProject: (id: string | null) => void
  selectedProjectId: string | null
  onClose: () => void
}

export function ProjectsPanel({ onSelectProject, selectedProjectId, onClose }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    setError(null)
    try {
      const data = await listProjects()
      setProjects(data.projects || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createProject(newName.trim(), newDesc.trim() || undefined)
      setNewName("")
      setNewDesc("")
      await loadProjects()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return
    setError(null)
    try {
      await updateProject(id, editName.trim(), editDesc.trim() || undefined)
      setEditingId(null)
      await loadProjects()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? Conversations will be unlinked but kept.")) return
    setError(null)
    try {
      await deleteProject(id)
      if (selectedProjectId === id) onSelectProject(null)
      await loadProjects()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--panel-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-medium">Projects</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--hover)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Create form */}
      <div className="p-3 border-b border-[var(--border)]">
        <input
          type="text"
          placeholder="Project name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="w-full px-2 py-1.5 text-sm bg-[var(--input-bg)] border border-[var(--border)] rounded mb-2 focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="w-full px-2 py-1.5 text-sm bg-[var(--input-bg)] border border-[var(--border)] rounded mb-2 focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-sm bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Create Project
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 border-b border-[var(--border)]">
          {error}
        </div>
      )}

      {/* All Projects button */}
      <button
        onClick={() => onSelectProject(null)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors",
          selectedProjectId === null && "bg-[var(--accent)]/10 text-[var(--accent)]"
        )}
      >
        <FolderOpen className="w-4 h-4" />
        All Projects
      </button>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="p-4 text-center text-sm text-[var(--muted)]">
            No projects yet. Create one above.
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors",
                selectedProjectId === project.id && "bg-[var(--accent)]/10"
              )}
            >
              {editingId === project.id ? (
                /* Edit mode */
                <div className="p-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate(project.id)}
                    className="w-full px-2 py-1 text-sm bg-[var(--input-bg)] border border-[var(--border)] rounded mb-1 focus:outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate(project.id)}
                    placeholder="Description"
                    className="w-full px-2 py-1 text-sm bg-[var(--input-bg)] border border-[var(--border)] rounded mb-2 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleUpdate(project.id)}
                      className="px-2 py-0.5 text-xs bg-[var(--accent)] text-white rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-0.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--hover)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => onSelectProject(project.id)}
                >
                  <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{project.name}</div>
                    {project.description && (
                      <div className="text-xs text-[var(--muted)] truncate">{project.description}</div>
                    )}
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-[var(--muted)] flex items-center gap-0.5">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {project.conversation_count || 0}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] flex items-center gap-0.5">
                        <Database className="w-2.5 h-2.5" />
                        {project.kb_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(menuOpen === project.id ? null : project.id)
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--hover)] transition-opacity"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen === project.id && (
                      <div className="absolute right-0 top-6 z-10 bg-[var(--panel-bg)] border border-[var(--border)] rounded shadow-lg py-1 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(project.id)
                            setEditName(project.name)
                            setEditDesc(project.description || "")
                            setMenuOpen(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--hover)]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(project.id)
                            setMenuOpen(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-[var(--hover)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
