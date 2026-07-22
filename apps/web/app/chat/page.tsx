'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Plus, Settings, Menu, X, Send, Bot, User, Sparkles,
  Star, Archive, MoreHorizontal, Pencil, Trash2, Clock, ChevronDown,
  Brain, Plug, Wrench, FolderOpen, CheckCircle2, Copy, Check, EyeOff,
  Filter, FileCode
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatView } from '../../components/chat/ChatView';
import { SettingsPanel } from '../../components/panels/SettingsPanel';
import { ModelSelector } from '../../components/chat/ModelSelector';
import { AddToChatOverlay } from '../../components/chat/AddToChatOverlay';
import { AgentsPanel } from '../../components/agents/AgentsPanel';
import { SkillsPanel } from '../../components/skills/SkillsPanel';
import { KnowledgeBasePanel } from '../../components/kb/KnowledgeBasePanel';
import { ProjectsPanel } from '../../components/projects/ProjectsPanel';
import { MemoryPanel } from '../../components/memory/MemoryPanel';
import { ConnectorsPanel } from '../../components/connectors/ConnectorsPanel';
import { ArtifactPanel } from '../../components/artifacts/ArtifactPanel';
import { useChatStore } from '../../stores/chat';
import {
  listConversations,
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  updateConversation as apiUpdateConversation,
} from '../../lib/api';

type Conversation = {
  id: string;
  title: string;
  model: string;
  starred?: boolean;
  archived?: boolean;
  updated_at: number;
};

export default function ChatPage() {
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chats');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'starred'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const {
    activeConversation, setActiveConversation, settingsPanelOpen, setSettingsPanelOpen,
    modelSelectorOpen, setModelSelectorOpen, incognito, toggleIncognito,
    selectedProjectId, setSelectedProjectId
  } = useChatStore();
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchConversations(); }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const fetchConversations = async () => {
    try {
      const data = await listConversations();
      const all = data.conversations || [];
      setConversations(all.filter((c: Conversation) => !c.archived));
      setArchivedConversations(all.filter((c: Conversation) => c.archived));
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const handleCreateConversation = async () => {
    try {
      const conv = await apiCreateConversation('New conversation');
      setConversations(prev => [{ ...conv, updated_at: Date.now() }, ...prev]);
      setActiveConversation(conv.id);
      setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await apiDeleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      setArchivedConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversation === id) setActiveConversation(null);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleArchiveConversation = async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    try {
      await apiUpdateConversation(id, { archived: true });
      setConversations(prev => prev.filter(c => c.id !== id));
      setArchivedConversations(prev => [{ ...conv, archived: true }, ...prev]);
      if (activeConversation === id) setActiveConversation(null);
    } catch (err) {
      console.error('Failed to archive conversation:', err);
    }
  };

  const handleUnarchiveConversation = async (id: string) => {
    const conv = archivedConversations.find(c => c.id === id);
    if (!conv) return;
    try {
      await apiUpdateConversation(id, { archived: false });
      setArchivedConversations(prev => prev.filter(c => c.id !== id));
      setConversations(prev => [{ ...conv, archived: false }, ...prev]);
    } catch (err) {
      console.error('Failed to unarchive conversation:', err);
    }
  };

  const handleRenameConversation = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await apiUpdateConversation(id, { title: editTitle.trim() });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
      setArchivedConversations(prev => prev.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
      setEditingId(null);
      setEditTitle('');
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleToggleStar = async (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const newStarred = !conv.starred;
    try {
      await apiUpdateConversation(id, { starred: newStarred });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, starred: newStarred } : c));
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const starredConversations = conversations.filter(c => c.starred);
  const recentConversations = conversations.filter(c => !c.starred);
  const displayedConversations = chatFilter === 'starred' ? starredConversations : recentConversations;

  const navItems = [
    { icon: MessageSquare, label: 'Chats', tab: 'chats' },
    { icon: FolderOpen, label: 'Projects', tab: 'projects' },
    { icon: Wrench, label: 'Agents', tab: 'agents' },
    { icon: Clock, label: 'Tasks', tab: 'tasks' },
    { icon: FileCode, label: 'Artifacts', tab: 'artifacts' },
    { icon: Brain, label: 'Memory', tab: 'memory' },
    { icon: Plug, label: 'Connectors', tab: 'connectors' },
    { icon: Settings, label: 'Settings', tab: 'settings', onClick: () => setSettingsPanelOpen(true) },
  ];

  return (
    <QueryClientProvider client={queryClient}>
    <div className="flex h-screen bg-bg-primary">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-bg-secondary border-r border-border transition-transform duration-200",
        "md:relative md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-cyan">
              <span className="text-sm font-bold text-white">K</span>
            </div>
            <span className="text-sm font-semibold text-text-primary">Kyro Chat</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 rounded-lg text-text-muted hover:bg-bg-hover">
            <X size={18} />
          </button>
        </div>

        {/* New Chat button */}
        <div className="p-3">
          <button
            onClick={handleCreateConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
            New chat
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                if (item.onClick) item.onClick();
                else setActiveTab(item.tab);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors mb-0.5",
                activeTab === item.tab
                  ? "bg-bg-active text-accent"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}

          {/* Conversations list */}
          {activeTab === 'chats' && <div className="mt-4">
            {/* Filter dropdown */}
            <div className="relative mb-2 px-1">
              <button
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary"
              >
                <Filter size={10} />
                {chatFilter === 'starred' ? 'Starred' : 'All chats'}
                <ChevronDown size={10} className={cn("transition-transform", filterMenuOpen && "rotate-180")} />
              </button>
              {filterMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterMenuOpen(false)} />
                  <div className="absolute left-1 top-full z-20 mt-0.5 w-36 rounded-lg border border-border bg-bg-primary py-1 shadow-xl">
                    <button
                      onClick={() => { setChatFilter('all'); setFilterMenuOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        chatFilter === 'all' ? "text-accent" : "text-text-secondary hover:bg-bg-tertiary"
                      )}
                    >
                      All chats
                    </button>
                    <button
                      onClick={() => { setChatFilter('starred'); setFilterMenuOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        chatFilter === 'starred' ? "text-accent" : "text-text-secondary hover:bg-bg-tertiary"
                      )}
                    >
                      <Star size={10} className="fill-current" />
                      Starred
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Starred section (only when showing all) */}
            {chatFilter === 'all' && starredConversations.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Starred
                </h3>
                {starredConversations.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={activeConversation === conv.id}
                    editingId={editingId}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    onSelect={() => { setActiveConversation(conv.id); setSidebarOpen(false); }}
                    onContextMenu={(e) => handleContextMenu(e, conv.id)}
                    onRename={() => handleRenameConversation(conv.id)}
                    onStartEdit={(id, title) => { setEditingId(id); setEditTitle(title); }}
                  />
                ))}
              </div>
            )}

            {/* Recent / Filtered list */}
            <div>
              {chatFilter === 'all' && (
                <h3 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Recent
                </h3>
              )}
              {displayedConversations.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeConversation === conv.id}
                  editingId={editingId}
                  editTitle={editTitle}
                  setEditTitle={setEditTitle}
                  onSelect={() => { setActiveConversation(conv.id); setSidebarOpen(false); }}
                  onContextMenu={(e) => handleContextMenu(e, conv.id)}
                  onRename={() => handleRenameConversation(conv.id)}
                  onStartEdit={(id, title) => { setEditingId(id); setEditTitle(title); }}
                />
              ))}
              {displayedConversations.length === 0 && (
                <p className="px-3 py-4 text-xs text-text-muted text-center">
                  {chatFilter === 'starred' ? 'No starred conversations' : 'No conversations yet'}
                </p>
              )}
            </div>

            {/* Archived */}
            {chatFilter === 'all' && archivedConversations.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary"
                >
                  <Archive size={12} />
                  Archived ({archivedConversations.length})
                  <ChevronDown size={12} className={cn("transition-transform", showArchived && "rotate-180")} />
                </button>
                {showArchived && archivedConversations.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={false}
                    editingId={editingId}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    onSelect={() => { setActiveConversation(conv.id); setSidebarOpen(false); }}
                    onContextMenu={(e) => handleContextMenu(e, conv.id)}
                    onRename={() => handleRenameConversation(conv.id)}
                    onStartEdit={(id, title) => { setEditingId(id); setEditTitle(title); }}
                  />
                ))}
              </div>
            )}
          </div>
          }

          {/* Agents panel */}
          {activeTab === 'agents' && (
            <div className="mt-2">
              <AgentsPanel />
            </div>
          )}

          {/* Skills panel (shown under Tasks) */}
          {activeTab === 'tasks' && (
            <div className="mt-2">
              <SkillsPanel />
            </div>
          )}

          {/* Memory panel */}
          {activeTab === 'memory' && (
            <div className="mt-2">
              <MemoryPanel />
            </div>
          )}

          {/* Connectors panel */}
          {activeTab === 'connectors' && (
            <div className="mt-2">
              <ConnectorsPanel />
            </div>
          )}

          {/* Knowledge Bases panel (shown under Projects) */}
          {activeTab === 'projects' && (
            <div className="mt-2">
              {selectedProjectId ? (
                <KnowledgeBasePanel projectId={selectedProjectId} />
              ) : (
                <ProjectsPanel
                  onSelectProject={setSelectedProjectId}
                  selectedProjectId={selectedProjectId}
                  onClose={() => setActiveTab('chats')}
                />
              )}
            </div>
          )}

          {/* Artifacts panel — global across all chats */}
          {activeTab === 'artifacts' && (
            <div className="mt-2">
              <ArtifactPanel />
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple to-accent text-xs font-bold text-white">
              F
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">Favour Chibuike</p>
              <p className="text-[10px] text-text-muted truncate">Free Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu fixed z-[100] w-44 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 250) }}
        >
          <button
            onClick={() => {
              const conv = [...conversations, ...archivedConversations].find(c => c.id === contextMenu.id);
              if (conv) { setEditingId(contextMenu.id); setEditTitle(conv.title); }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <Pencil size={14} /> Rename
          </button>
          <button
            onClick={() => { handleToggleStar(contextMenu.id); setContextMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <Star size={14} /> {conversations.find(c => c.id === contextMenu.id)?.starred ? 'Unstar' : 'Star'}
          </button>
          <button
            onClick={() => { handleArchiveConversation(contextMenu.id); setContextMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <Archive size={14} /> Archive
          </button>
          <div className="my-0.5 h-px bg-border" />
          <button
            onClick={() => { handleDeleteConversation(contextMenu.id); setContextMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-red-500/10"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat header with incognito toggle */}
        <ChatPageHeader
          onMenuClick={() => setSidebarOpen(true)}
          incognito={incognito}
          onToggleIncognito={toggleIncognito}
          onBack={() => {
            setActiveConversation(null);
          }}
          hasActiveConversation={!!activeConversation}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatView />
        </div>
      </main>

      {/* Settings Panel */}
      {settingsPanelOpen && <SettingsPanel />}

      {/* Model Selector */}
      {modelSelectorOpen && <ModelSelector />}

      {/* Add to Chat overlay */}
      <AddToChatOverlay />
    </div>
    </QueryClientProvider>
  );
}

/* ─── Chat Page Header ─── */
function ChatPageHeader({
  onMenuClick,
  incognito,
  onToggleIncognito,
  onBack,
  hasActiveConversation,
}: {
  onMenuClick: () => void;
  incognito: boolean;
  onToggleIncognito: () => void;
  onBack: () => void;
  hasActiveConversation: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 md:px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary md:hidden"
        >
          <Menu size={18} />
        </button>
        {hasActiveConversation && (
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* Incognito toggle */}
        <button
          onClick={onToggleIncognito}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            incognito
              ? "bg-accent/15 text-accent"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          )}
          title={incognito ? "Incognito mode on — chats won't be saved" : "Turn on incognito mode"}
        >
          <EyeOff size={16} />
        </button>
      </div>
    </header>
  );
}

/* ─── Conversation Item ─── */
function ConversationItem({
  conv, isActive, editingId, editTitle, setEditTitle, onSelect, onContextMenu, onRename, onStartEdit
}: {
  conv: Conversation; isActive: boolean; editingId: string | null; editTitle: string;
  setEditTitle: (v: string) => void; onSelect: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onRename: () => void; onStartEdit: (id: string, title: string) => void;
}) {
  const isEditing = editingId === conv.id;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRename();
            if (e.key === 'Escape') onStartEdit('', '');
          }}
          onBlur={onRename}
          className="flex-1 rounded-md bg-bg-tertiary px-2 py-1 text-sm text-text-primary outline-none ring-1 ring-accent"
        />
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left",
        isActive
          ? "bg-bg-active text-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      )}
    >
      <MessageSquare size={14} className="shrink-0" />
      <span className="flex-1 truncate">{conv.title}</span>
      {conv.starred && <Star size={12} className="shrink-0 text-warning fill-warning" />}
      <button
        onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
        className="hidden group-hover:flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
      >
        <MoreHorizontal size={12} />
      </button>
    </button>
  );
}
