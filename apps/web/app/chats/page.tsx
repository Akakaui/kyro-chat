'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, Star, Trash2, Plus, MessageSquare, FolderOpen,
  Archive, MoreHorizontal, CheckSquare, Square, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/stores/chat';
import {
  listConversations,
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  updateConversation as apiUpdateConversation,
  listProjects,
  type Conversation,
  type Project,
} from '@/lib/api';

function formatRelativeTime(timestamp?: number | string): string {
  if (!timestamp) return '';
  const time = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(time)) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

function ChatsPageContent() {
  const router = useRouter();
  const { setActiveConversation } = useChatStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPinned, setFilterPinned] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [convRes, projRes] = await Promise.all([
        listConversations().catch(() => ({ conversations: [] })),
        listProjects().catch(() => ({ projects: [] })),
      ]);
      setConversations((convRes.conversations || []).filter(c => !c.archived));
      setProjects(projRes.projects || []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = conversations.filter(c => {
    if (filterPinned && !c.starred) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return c.title.toLowerCase().includes(q);
    }
    return true;
  });

  const starred = filtered.filter(c => c.starred);
  const recent = filtered.filter(c => !c.starred);

  const handleNewChat = async () => {
    try {
      const conv = await apiCreateConversation('New conversation');
      setActiveConversation(conv.id);
      router.push(`/chat?id=${conv.id}`);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleOpenChat = (id: string) => {
    if (multiSelect) {
      toggleSelect(id);
    } else {
      setActiveConversation(id);
      router.push(`/chat?id=${id}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await apiDeleteConversation(id).catch(() => {});
    }
    setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setMultiSelect(false);
  };

  const handleBulkMove = (projectId: string) => {
    selectedIds.forEach(id => {
      apiUpdateConversation(id, { project_id: projectId }).catch(() => {});
    });
    setConversations(prev =>
      prev.map(c => selectedIds.has(c.id) ? { ...c, project_id: projectId } : c)
    );
    setShowMoveModal(false);
    setSelectedIds(new Set());
    setMultiSelect(false);
  };

  const handleStarToggle = async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const newStarred = !conv.starred;
    await apiUpdateConversation(id, { starred: newStarred }).catch(() => {});
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, starred: newStarred } : c)
    );
  };

  const handleDelete = async (id: string) => {
    await apiDeleteConversation(id).catch(() => {});
    setConversations(prev => prev.filter(c => c.id !== id));
    setContextMenu(null);
  };

  const handleArchive = async (id: string) => {
    await apiUpdateConversation(id, { archived: true }).catch(() => {});
    setConversations(prev => prev.filter(c => c.id !== id));
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const renderConversationCard = (conv: Conversation) => (
    <div
      key={conv.id}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all cursor-pointer",
        multiSelect && selectedIds.has(conv.id)
          ? "border-accent/50 bg-accent/5"
          : "border-border bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary"
      )}
      onClick={() => handleOpenChat(conv.id)}
      onContextMenu={(e) => handleContextMenu(e, conv.id)}
    >
      {multiSelect && (
        <div className="shrink-0">
          {selectedIds.has(conv.id) ? (
            <CheckSquare size={16} className="text-accent" />
          ) : (
            <Square size={16} className="text-text-muted" />
          )}
        </div>
      )}

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary">
        <MessageSquare size={16} className="text-text-muted" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{conv.title}</p>
        <p className="text-xs text-text-muted mt-0.5">{formatRelativeTime(conv.updated_at)}</p>
      </div>

      {conv.starred && <Star size={14} className="shrink-0 text-amber-400 fill-amber-400" />}

      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleStarToggle(conv.id); }}
          className="p-1 rounded-md text-text-muted hover:text-amber-400 hover:bg-bg-hover"
          title={conv.starred ? 'Unstar' : 'Star'}
        >
          <Star size={14} className={conv.starred ? 'fill-amber-400 text-amber-400' : ''} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleArchive(conv.id); }}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover"
          title="Archive"
        >
          <Archive size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleContextMenu(e, conv.id); }}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );

  const pinnedList = (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3 px-1">
        Starred
      </h3>
      <div className="space-y-2">
        {starred.map(renderConversationCard)}
      </div>
    </div>
  );

  const recentList = (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3 px-1">
        Recent
      </h3>
      <div className="space-y-2">
        {recent.map(renderConversationCard)}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-bg-primary">
        {/* Sidebar nav — reuses chat/page.tsx sidebar pattern */}
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
              onClick={handleNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500/80 mb-4"
            >
              <Plus size={16} />
              New chat
            </button>

            <div className="space-y-1">
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary bg-bg-active">
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
              <h1 className="text-lg font-semibold text-text-primary">Chats</h1>
              <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                {conversations.length}
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
                  placeholder="Search chats..."
                  className="h-8 w-48 md:w-64 rounded-lg border border-border bg-bg-secondary pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>

              {/* Filter pinned */}
              <button
                onClick={() => setFilterPinned(!filterPinned)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  filterPinned
                    ? "bg-accent/15 text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
                title="Filter starred chats"
              >
                <Filter size={16} />
              </button>

              {/* Multi-select toggle */}
              <button
                onClick={() => { setMultiSelect(!multiSelect); setSelectedIds(new Set()); }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  multiSelect
                    ? "bg-accent/15 text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
                title="Select multiple chats"
              >
                <CheckSquare size={16} />
              </button>

              {/* New Chat */}
              <button
                onClick={handleNewChat}
                className="hidden md:flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-amber-500/80 transition-colors"
              >
                <Plus size={14} />
                New Chat
              </button>
            </div>
          </header>

          {/* Multi-select toolbar */}
          {multiSelect && selectedIds.size > 0 && (
            <div className="flex items-center justify-between border-b border-border bg-accent/5 px-4 md:px-6 py-2">
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className="text-xs text-accent hover:underline">
                  {selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}
                </button>
                <span className="text-xs text-text-muted">{selectedIds.size} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMoveModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  <FolderOpen size={12} />
                  Move to project
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
                  <MessageSquare size={28} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-secondary mb-1">
                  {searchQuery ? 'No chats match your search' : 'No conversations yet'}
                </p>
                <p className="text-xs text-text-muted mb-4">
                  {searchQuery ? 'Try a different search term' : 'Start a new conversation to get going'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={handleNewChat}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-amber-500/80 transition-colors"
                  >
                    <Plus size={14} />
                    New Chat
                  </button>
                )}
              </div>
            ) : (
              <>
                {filterPinned && starred.length === 0 && (
                  <p className="text-center text-sm text-text-muted py-8">No starred chats</p>
                )}
                {starred.length > 0 && pinnedList}
                {recent.length > 0 && recentList}
              </>
            )}
          </div>
        </main>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
            >
              <button
                onClick={() => { handleStarToggle(contextMenu.id); setContextMenu(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <Star size={14} />
                {conversations.find(c => c.id === contextMenu.id)?.starred ? 'Unstar' : 'Star'}
              </button>
              <button
                onClick={() => { handleArchive(contextMenu.id); setContextMenu(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                <Archive size={14} /> Archive
              </button>
              <div className="my-0.5 h-px bg-border" />
              <button
                onClick={() => { handleDelete(contextMenu.id); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}

        {/* Move to Project Modal */}
        {showMoveModal && (
          <>
            <div className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm" onClick={() => setShowMoveModal(false)} />
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
                <h2 className="text-sm font-semibold text-text-primary mb-3">Move to project</h2>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {projects.length === 0 ? (
                    <p className="text-xs text-text-muted py-2">No projects found</p>
                  ) : (
                    projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleBulkMove(p.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                      >
                        <FolderOpen size={14} />
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function ChatsPage() {
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
      <ChatsPageContent />
    </QueryClientProvider>
  );
}
