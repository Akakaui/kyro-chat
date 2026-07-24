'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, Trash2, MoreHorizontal, FileText, Globe, Code,
  Image, LayoutGrid, List, MessageSquare, FolderOpen, Square, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  listAllArtifacts,
  deleteArtifact,
  type Artifact,
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

const artifactTypeIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  html: Globe,
  react: Code,
  code: FileText,
  markdown: FileText,
  csv: FileText,
  image: Image,
  mermaid: LayoutGrid,
  pdf: FileText,
  video: FileText,
};

const artifactTypeColors: Record<string, string> = {
  html: 'from-blue-500/20 to-cyan-500/20 text-cyan-400',
  react: 'from-purple-500/20 to-pink-500/20 text-purple-400',
  code: 'from-green-500/20 to-emerald-500/20 text-green-400',
  markdown: 'from-amber-500/20 to-yellow-500/20 text-amber-400',
  csv: 'from-teal-500/20 to-cyan-500/20 text-teal-400',
  image: 'from-pink-500/20 to-rose-500/20 text-pink-400',
  mermaid: 'from-indigo-500/20 to-blue-500/20 text-indigo-400',
  pdf: 'from-red-500/20 to-orange-500/20 text-red-400',
  video: 'from-violet-500/20 to-purple-500/20 text-violet-400',
};

function ArtifactsPageContent() {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    loadArtifacts();
  }, []);

  const loadArtifacts = async () => {
    try {
      const res = await listAllArtifacts();
      setArtifacts(res.artifacts || []);
    } catch {
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = artifacts.filter(a => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
  });

  const handleDelete = async (id: string) => {
    await deleteArtifact(id).catch(() => {});
    setArtifacts(prev => prev.filter(a => a.id !== id));
    setContextMenu(null);
  };

  const renderArtifactCard = (artifact: Artifact) => {
    const Icon = artifactTypeIcons[artifact.type] || FileText;
    const colorClass = artifactTypeColors[artifact.type] || 'from-gray-500/20 to-gray-500/20 text-gray-400';

    if (viewMode === 'list') {
      return (
        <div
          key={artifact.id}
          className="group flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3 hover:border-border-strong hover:bg-bg-tertiary transition-all cursor-pointer"
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: artifact.id, x: e.clientX, y: e.clientY }); }}
        >
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", colorClass)}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{artifact.title}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {artifact.type.toUpperCase()} · {formatRelativeTime(artifact.created_at)}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(artifact.id); }}
            className="hidden group-hover:flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      );
    }

    return (
      <div
        key={artifact.id}
        className={cn(
          "group relative flex flex-col rounded-xl border border-border bg-bg-secondary overflow-hidden",
          "hover:border-border-strong hover:bg-bg-tertiary transition-all cursor-pointer"
        )}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: artifact.id, x: e.clientX, y: e.clientY }); }}
      >
        {/* Preview area */}
        <div className={cn("relative h-36 bg-gradient-to-br flex items-center justify-center", colorClass)}>
          <Icon size={36} className="opacity-40" />
          {/* Type badge */}
          <span className="absolute top-2 left-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
            {artifact.type}
          </span>
        </div>

        {/* Info */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary truncate">{artifact.title}</p>
            <p className="text-[11px] text-text-muted mt-0.5">{formatRelativeTime(artifact.created_at)}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(artifact.id); }}
            className="hidden group-hover:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
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
              <button
                onClick={() => router.push('/projects')}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <FolderOpen size={16} />
                Projects
              </button>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary bg-bg-active">
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
              <h1 className="text-lg font-semibold text-text-primary">Artifacts</h1>
              <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                {artifacts.length}
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
                  placeholder="Search artifacts..."
                  className="h-8 w-48 md:w-64 rounded-lg border border-border bg-bg-secondary pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>

              {/* View toggle */}
              <div className="flex rounded-lg border border-border bg-bg-secondary overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center transition-colors",
                    viewMode === 'grid' ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center transition-colors",
                    viewMode === 'list' ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </header>

          {/* Artifact grid/list */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
                  <FileText size={28} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-secondary mb-1">
                  {searchQuery ? 'No artifacts match your search' : 'No artifacts yet'}
                </p>
                <p className="text-xs text-text-muted">
                  {searchQuery ? 'Try a different search term' : 'Artifacts appear here when created in conversations'}
                </p>
              </div>
            ) : (
              <div className={cn(
                viewMode === 'grid'
                  ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                  : "space-y-2"
              )}>
                {filtered.map(renderArtifactCard)}
              </div>
            )}
          </div>
        </main>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-[100] w-36 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 160), top: Math.min(contextMenu.y, window.innerHeight - 100) }}
            >
              <button
                onClick={() => { handleDelete(contextMenu.id); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function ArtifactsPage() {
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
      <ArtifactsPageContent />
    </QueryClientProvider>
  );
}
