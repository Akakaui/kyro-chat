'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, Plus, FolderOpen, MessageSquare, Square,
  MoreHorizontal, Pencil, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  listProjects,
  createProject,
  deleteProject,
  updateProject,
  type Project,
} from '@/lib/api';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths < 12 ? `${diffMonths}mo ago` : `${Math.floor(diffMonths / 12)}y ago`;
}

function ProjectsPageContent() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await listProjects();
      setProjects(res.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = projects.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newProjectName.trim(), newProjectDesc.trim() || undefined);
      setProjects(prev => [project, ...prev]);
      setNewProjectName('');
      setNewProjectDesc('');
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id).catch(() => {});
    setProjects(prev => prev.filter(p => p.id !== id));
    setContextMenu(null);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    await updateProject(id, editName.trim()).catch(() => {});
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: editName.trim() } : p));
    setEditingId(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-bg-primary">
        {/* Sidebar nav */}
        <aside className="hidden md:flex w-[270px] flex-col border-r border-border shrink-0">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-cyan-500">
                <span className="text-sm font-bold text-white">K</span>
              </div>
              <span className="text-sm font-semibold text-text-primary">Kyro Chat</span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            <button
              onClick={() => router.push('/chat')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500/80 mb-4"
            >
              <Plus size={16} />
              New chat
            </button>

            <div className="space-y-1">
              <button
                onClick={() => router.push('/chats')}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <MessageSquare size={16} />
                Chats
              </button>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary bg-bg-active">
                <FolderOpen size={16} />
                Projects
              </button>
              <button
                onClick={() => router.push('/artifacts')}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <Square size={16} />
                Artifacts
              </button>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary md:hidden"
              >
                <ArrowLeft size={18} />
              </button>
              <h1 className="text-lg font-semibold text-text-primary">Projects</h1>
              <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                {projects.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="h-8 w-48 md:w-64 rounded-lg border border-border bg-bg-secondary pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>

              {/* New Project */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="hidden md:flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-amber-500/80 transition-colors"
              >
                <Plus size={14} />
                New project
              </button>
            </div>
          </header>

          {/* Project grid */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
                  <FolderOpen size={28} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-secondary mb-1">
                  {searchQuery ? 'No projects match your search' : 'No projects yet'}
                </p>
                <p className="text-xs text-text-muted mb-4">
                  {searchQuery ? 'Try a different search term' : 'Create a project to organize your conversations'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-amber-500/80 transition-colors"
                  >
                    <Plus size={14} />
                    New project
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(project => (
                  <div
                    key={project.id}
                    className="group relative flex flex-col rounded-xl border border-border bg-bg-secondary p-5 hover:border-border-strong hover:bg-bg-tertiary transition-all cursor-pointer"
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: project.id, x: e.clientX, y: e.clientY }); }}
                  >
                    {/* Project icon */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-amber-500/10 mb-3">
                      <FolderOpen size={20} className="text-accent" />
                    </div>

                    {/* Name */}
                    {editingId === project.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(project.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => handleRename(project.id)}
                        className="text-sm font-semibold text-text-primary bg-bg-tertiary rounded-md px-2 py-1 outline-none ring-1 ring-accent mb-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <h3 className="text-sm font-semibold text-text-primary truncate mb-1">{project.name}</h3>
                    )}

                    {/* Description */}
                    <p className="text-xs text-text-muted line-clamp-2 mb-3 flex-1">
                      {project.description || 'No description'}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-muted">
                        {formatRelativeTime(project.updated_at || project.created_at)}
                      </span>
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(project.id);
                            setEditName(project.name);
                          }}
                          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(project.id);
                          }}
                          className="p-1 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-[100] w-40 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 170), top: Math.min(contextMenu.y, window.innerHeight - 150) }}
            >
              <button
                onClick={() => {
                  const p = projects.find(p => p.id === contextMenu.id);
                  if (p) { setEditingId(p.id); setEditName(p.name); }
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <Pencil size={14} /> Rename
              </button>
              <div className="my-0.5 h-px bg-border" />
              <button
                onClick={() => handleDelete(contextMenu.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}

        {/* Create Project Modal */}
        {showCreateModal && (
          <>
            <div className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl border border-border bg-bg-secondary p-6 shadow-2xl">
                <h2 className="text-base font-semibold text-text-primary mb-4">Create new project</h2>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Name</label>
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newProjectName.trim()) handleCreate(); }}
                      placeholder="e.g. Website Redesign"
                      className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-secondary mb-1 block">Description (optional)</label>
                    <textarea
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      placeholder="What is this project about?"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    onClick={() => { setShowCreateModal(false); setNewProjectName(''); setNewProjectDesc(''); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newProjectName.trim() || creating}
                    className={cn(
                      "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors",
                      (!newProjectName.trim() || creating) ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-500/80"
                    )}
                  >
                    {creating ? 'Creating...' : 'Create project'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function ProjectsPage() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ProjectsPageContent />
    </QueryClientProvider>
  );
}
