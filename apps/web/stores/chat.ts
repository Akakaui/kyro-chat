import { create } from "zustand"
import type { Conversation, Message, Artifact, UserSettings, Model, Skill, Agent, KbSource } from "@/lib/api"

export type PermissionLevel = "allow" | "ask" | "deny"

export interface MCPTool {
  name: string
  description: string
}

export interface Connector {
  id: string
  name: string
  type: "mcp" | "api"
  url: string
  status: "connected" | "disconnected"
  authType?: "none" | "oauth" | "api_key" | "bearer"
  tools?: MCPTool[]
  description?: string
}

export interface AttachedFile {
  name: string
  type: string
  size: number
  preview?: string
}

import { AVAILABLE_MODELS } from "@/lib/api"

function generateSessionId(): string {
  return crypto.randomUUID()
}

interface ChatState {
  // Conversations
  conversations: Conversation[]
  activeConversation: string | null
  setConversations: (conversations: Conversation[]) => void
  setActiveConversation: (id: string | null) => void
  addConversation: (conversation: Conversation) => void
  removeConversation: (id: string) => void
  updateConversationLocal: (id: string, data: Partial<Conversation>) => void

  // Session isolation
  currentSessionId: string | null
  sessionMap: Record<string, string>
  getSessionId: () => string
  selectConversation: (id: string) => void
  createConversation: (conversation: Conversation) => void

  // Messages
  messages: Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, data: Partial<Message>) => void

  // Streaming
  isStreaming: boolean
  setStreaming: (streaming: boolean) => void

  // Panel
  panelOpen: boolean
  togglePanel: () => void
  setPanelOpen: (open: boolean) => void

  // Settings
  settingsPanelOpen: boolean
  setSettingsPanelOpen: (open: boolean) => void
  settings: UserSettings
  setSettings: (settings: UserSettings) => void
  setAppearance: (appearance: UserSettings["appearance"]) => void
  toggleWebSearch: () => void

  // Model
  selectedModel: Model
  setSelectedModel: (model: Model) => void

  // Incognito
  incognito: boolean
  toggleIncognito: () => void

  // Chat mode (Act / Build)
  chatMode: "act" | "build"
  setChatMode: (mode: "act" | "build") => void

  // Accept all permissions (no permission prompts)
  acceptAll: boolean
  toggleAcceptAll: () => void

  // Artifacts
  artifacts: Artifact[]
  setArtifacts: (artifacts: Artifact[]) => void
  addArtifact: (artifact: Artifact) => void
  artifactViewerOpen: boolean
  setArtifactViewerOpen: (open: boolean) => void
  activeArtifact: Artifact | null
  setActiveArtifact: (artifact: Artifact | null) => void

  // Message reactions
  likedMessages: Record<string, boolean>
  dislikedMessages: Record<string, boolean>
  toggleLike: (messageId: string) => void
  toggleDislike: (messageId: string) => void

  // Overlay states
  addToChatOverlayOpen: boolean
  setAddToChatOverlayOpen: (open: boolean) => void
  modelSelectorOpen: boolean
  setModelSelectorOpen: (open: boolean) => void
  artifactQueueOpen: boolean
  setArtifactQueueOpen: (open: boolean) => void
  shareDialogOpen: boolean
  setShareDialogOpen: (open: boolean) => void

  // Connectors
  connectors: Connector[]
  setConnectors: (connectors: Connector[]) => void
  addConnector: (connector: Connector) => void
  removeConnector: (id: string) => void
  updateConnector: (id: string, data: Partial<Connector>) => void

  // Permissions
  permissions: Record<string, Record<string, "allow" | "ask" | "deny">>
  setPermission: (connectorId: string, toolName: string, permission: "allow" | "ask" | "deny") => void
  setAllPermissions: (connectorId: string, toolNames: string[], permission: "allow" | "ask" | "deny") => void
  defaultPermission: "strict" | "permissive" | "custom"
  setDefaultPermission: (p: "strict" | "permissive" | "custom") => void

  // Tool permissions (new system)
  toolPermissions: Record<string, "allow" | "ask" | "deny">
  globalPermissions: { builtin: "allow" | "ask" | "deny"; mcp: "allow" | "ask" | "deny"; custom_api: "allow" | "ask" | "deny" }
  setToolPermissionState: (toolName: string, permission: "allow" | "ask" | "deny") => void
  setGlobalPermissionState: (sourceType: string, permission: "allow" | "ask" | "deny") => void
  loadPermissions: () => Promise<void>

  // Permissions panel
  permissionsPanelOpen: boolean
  permissionsPanelConnectorId: string | null
  setPermissionsPanelOpen: (open: boolean, connectorId?: string | null) => void

  // Attached files
  attachedFiles: AttachedFile[]
  setAttachedFiles: (files: AttachedFile[]) => void
  clearAttachedFiles: () => void

  // Browser
  browserEnabled: boolean
  persistentBrowser: boolean
  browserSessionId: string | null
  toggleBrowserEnabled: () => void
  togglePersistentBrowser: () => void
  setBrowserSessionId: (id: string | null) => void

  // Human input
  humanInputRequired: { requestId: string; prompt: string } | null
  setHumanInputRequired: (req: { requestId: string; prompt: string } | null) => void

  // Projects
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  projectsPanelOpen: boolean
  setProjectsPanelOpen: (open: boolean) => void

  // Sandbox
  sandboxId: string | null
  setSandboxId: (id: string | null) => void
  sandboxFiles: SandboxFile[]
  setSandboxFiles: (files: SandboxFile[]) => void
  sandboxFileViewerOpen: boolean
  setSandboxFileViewerOpen: (open: boolean) => void
  activeSandboxFile: SandboxFile | null
  setActiveSandboxFile: (file: SandboxFile | null) => void

  // Permission prompts (inline)
  pendingPermissions: Array<{
    id: string
    toolName: string
    description: string
    args?: Record<string, unknown>
    source?: string
  }>
  addPendingPermission: (perm: { id: string; toolName: string; description: string; args?: Record<string, unknown>; source?: string }) => void
  removePendingPermission: (id: string) => void
  clearPendingPermissions: () => void

  // Task tracking
  tasks: Array<{ id: string; name: string; status: "running" | "done" | "error" }>
  addTask: (task: { id: string; name: string; status: "running" | "done" | "error" }) => void
  updateTask: (id: string, status: "running" | "done" | "error") => void
  clearTasks: () => void

  // Human using browser (agent takeover state)
  humanUsingBrowser: boolean
  setHumanUsingBrowser: (using: boolean) => void

  // Dynamic mention data
  skills: Skill[]
  setSkills: (skills: Skill[]) => void
  agents: Agent[]
  setAgents: (agents: Agent[]) => void
  knowledgeBases: KbSource[]
  setKnowledgeBases: (kbs: KbSource[]) => void
  mentionArtifacts: Array<{ id: string; name: string; type: string }>
  setMentionArtifacts: (artifacts: Array<{ id: string; name: string; type: string }>) => void

  // Fetch methods for dynamic data
  fetchSkills: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchKnowledgeBases: () => Promise<void>
  fetchMentionArtifacts: () => Promise<void>
}

export interface SandboxFile {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  content?: string
  children?: SandboxFile[]
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Conversations
  conversations: [],
  activeConversation: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversation: id }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
  removeConversation: (id) =>
    set((state) => {
      const { [id]: _removedSession, ...restSessionMap } = state.sessionMap
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversation:
          state.activeConversation === id ? null : state.activeConversation,
        currentSessionId:
          state.activeConversation === id ? null : state.currentSessionId,
        sessionMap: restSessionMap,
      }
    }),
  updateConversationLocal: (id, data) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    })),

  // Session isolation
  currentSessionId: null,
  sessionMap: {},
  getSessionId: () => {
    const state = get()
    if (state.currentSessionId) return state.currentSessionId
    const sessionId = generateSessionId()
    set({ currentSessionId: sessionId })
    return sessionId
  },
  selectConversation: (id) => {
    const state = get()
    const sessionId = state.sessionMap[id]
    if (sessionId) {
      set({ activeConversation: id, currentSessionId: sessionId })
    } else {
      const newSessionId = generateSessionId()
      set({
        activeConversation: id,
        currentSessionId: newSessionId,
        sessionMap: { ...state.sessionMap, [id]: newSessionId },
      })
    }
  },
  createConversation: (conversation) => {
    const sessionId = generateSessionId()
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversation: conversation.id,
      currentSessionId: sessionId,
      sessionMap: { ...state.sessionMap, [conversation.id]: sessionId },
    }))
  },

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, data) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...data } : m
      ),
    })),

  // Streaming
  isStreaming: false,
  setStreaming: (streaming) => set({ isStreaming: streaming }),

  // Panel
  panelOpen: false,
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  setPanelOpen: (open) => set({ panelOpen: open }),

  // Settings
  settingsPanelOpen: false,
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  settings: {
    full_name: "User",
    nickname: "",
    custom_instructions: "",
    capabilities: {
      web_search: true,
      browser: true,
      artifacts: true,
      code_execution: true,
      memory: true,
    },
    appearance: {
      theme: "dark",
      accent: "#e8590c",
      fontSize: "md",
    },
  },
  setSettings: (settings) => set({ settings }),
  setAppearance: (appearance) =>
    set((state) => ({ settings: { ...state.settings, appearance } })),
  toggleWebSearch: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        capabilities: {
          ...state.settings.capabilities,
          web_search: !state.settings.capabilities.web_search,
        },
      },
    })),

  // Model
  selectedModel: AVAILABLE_MODELS[0],
  setSelectedModel: (model) => set({ selectedModel: model }),

  // Incognito
  incognito: false,
  toggleIncognito: () => set((state) => ({ incognito: !state.incognito })),

  // Chat mode
  chatMode: "act",
  setChatMode: (mode) => set({ chatMode: mode }),

  // Accept all permissions
  acceptAll: false,
  toggleAcceptAll: () => set((state) => ({ acceptAll: !state.acceptAll })),

  // Artifacts
  artifacts: [],
  setArtifacts: (artifacts) => set({ artifacts }),
  addArtifact: (artifact) =>
    set((state) => ({ artifacts: [...state.artifacts, artifact] })),
  artifactViewerOpen: false,
  setArtifactViewerOpen: (open) => set({ artifactViewerOpen: open }),
  activeArtifact: null,
  setActiveArtifact: (artifact) => set({ activeArtifact: artifact }),

  // Message reactions
  likedMessages: {},
  dislikedMessages: {},
  toggleLike: (messageId) =>
    set((state) => {
      const wasLiked = state.likedMessages[messageId]
      return {
        likedMessages: { ...state.likedMessages, [messageId]: !wasLiked },
        dislikedMessages: wasLiked
          ? state.dislikedMessages
          : { ...state.dislikedMessages, [messageId]: false },
      }
    }),
  toggleDislike: (messageId) =>
    set((state) => {
      const wasDisliked = state.dislikedMessages[messageId]
      return {
        dislikedMessages: {
          ...state.dislikedMessages,
          [messageId]: !wasDisliked,
        },
        likedMessages: wasDisliked
          ? state.likedMessages
          : { ...state.likedMessages, [messageId]: false },
      }
    }),

  // Overlay states
  artifactQueueOpen: false,
  setArtifactQueueOpen: (open) => set({ artifactQueueOpen: open }),
  addToChatOverlayOpen: false,
  setAddToChatOverlayOpen: (open) => set({ addToChatOverlayOpen: open }),
  modelSelectorOpen: false,
  setModelSelectorOpen: (open) => set({ modelSelectorOpen: open }),
  shareDialogOpen: false,
  setShareDialogOpen: (open) => set({ shareDialogOpen: open }),

  // Connectors
  connectors: [
    {
      id: "1",
      name: "Notion",
      type: "mcp",
      url: "https://mcp.notion.com/mcp",
      status: "connected",
      authType: "oauth",
      tools: [
        { name: "create_page", description: "Create a new page in Notion" },
        { name: "search", description: "Search across all Notion content" },
        { name: "update_page", description: "Update an existing Notion page" },
        { name: "get_page", description: "Retrieve a specific Notion page" },
      ],
    },
    {
      id: "2",
      name: "GitHub",
      type: "mcp",
      url: "https://api.github.com/mcp",
      status: "disconnected",
      authType: "api_key",
      tools: [
        { name: "create_issue", description: "Create a new issue in a repository" },
        { name: "list_repos", description: "List repositories for an organization or user" },
      ],
    },
  ] as Connector[],
  setConnectors: (connectors) => set({ connectors }),
  addConnector: (connector) =>
    set((state) => ({ connectors: [...state.connectors, connector] })),
  removeConnector: (id) =>
    set((state) => ({ connectors: state.connectors.filter((c) => c.id !== id) })),
  updateConnector: (id, data) =>
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    })),

  // Permissions
  permissions: {},
  setPermission: (connectorId, toolName, permission) =>
    set((state) => ({
      permissions: {
        ...state.permissions,
        [connectorId]: {
          ...(state.permissions[connectorId] || {}),
          [toolName]: permission,
        },
      },
    })),
  setAllPermissions: (connectorId, toolNames, permission) =>
    set((state) => ({
      permissions: {
        ...state.permissions,
        [connectorId]: toolNames.reduce(
          (acc, name) => ({ ...acc, [name]: permission }),
          {} as Record<string, "allow" | "ask" | "deny">
        ),
      },
    })),
  defaultPermission: "strict",
  setDefaultPermission: (p) => set({ defaultPermission: p }),

  // Tool permissions (new system)
  toolPermissions: {},
  globalPermissions: { builtin: "ask", mcp: "ask", custom_api: "ask" },
  setToolPermissionState: (toolName, permission) =>
    set((state) => ({
      toolPermissions: { ...state.toolPermissions, [toolName]: permission },
    })),
  setGlobalPermissionState: (sourceType, permission) =>
    set((state) => ({
      globalPermissions: { ...state.globalPermissions, [sourceType]: permission },
    })),
  loadPermissions: async () => {
    try {
      const { getPermissions } = await import("@/lib/api")
      const data = await getPermissions()
      const toolPerms: Record<string, "allow" | "ask" | "deny"> = {}
      for (const t of data.tools) {
        toolPerms[t.toolName] = t.permission
      }
      set({
        toolPermissions: toolPerms,
        globalPermissions: data.globals,
      })
    } catch {
      // Silent fail - defaults already set
    }
  },

  // Permissions panel
  permissionsPanelOpen: false,
  permissionsPanelConnectorId: null,
  setPermissionsPanelOpen: (open, connectorId = null) =>
    set({ permissionsPanelOpen: open, permissionsPanelConnectorId: connectorId }),

  // Attached files
  attachedFiles: [],
  setAttachedFiles: (files) => set({ attachedFiles: files }),
  clearAttachedFiles: () => set({ attachedFiles: [] }),

  // Browser
  browserEnabled: true,
  persistentBrowser: false,
  browserSessionId: null,
  toggleBrowserEnabled: () =>
    set((state) => ({ browserEnabled: !state.browserEnabled })),
  togglePersistentBrowser: () =>
    set((state) => ({ persistentBrowser: !state.persistentBrowser })),
  setBrowserSessionId: (id) => set({ browserSessionId: id }),

  // Human input
  humanInputRequired: null,
  setHumanInputRequired: (req) => set({ humanInputRequired: req }),

  // Projects
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  projectsPanelOpen: false,
  setProjectsPanelOpen: (open) => set({ projectsPanelOpen: open }),

  // Sandbox
  sandboxId: null,
  setSandboxId: (id) => set({ sandboxId: id }),
  sandboxFiles: [],
  setSandboxFiles: (files) => set({ sandboxFiles: files }),
  sandboxFileViewerOpen: false,
  setSandboxFileViewerOpen: (open) => set({ sandboxFileViewerOpen: open }),
  activeSandboxFile: null,
  setActiveSandboxFile: (file) => set({ activeSandboxFile: file }),

  // Permission prompts (inline)
  pendingPermissions: [],
  addPendingPermission: (perm) =>
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, perm],
    })),
  removePendingPermission: (id) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.id !== id),
    })),
  clearPendingPermissions: () => set({ pendingPermissions: [] }),

  // Task tracking
  tasks: [],
  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
  clearTasks: () => set({ tasks: [] }),

  // Human using browser
  humanUsingBrowser: false,
  setHumanUsingBrowser: (using) => set({ humanUsingBrowser: using }),

  // Dynamic mention data
  skills: [],
  setSkills: (skills) => set({ skills }),
  agents: [],
  setAgents: (agents) => set({ agents }),
  knowledgeBases: [],
  setKnowledgeBases: (kbs) => set({ knowledgeBases: kbs }),
  mentionArtifacts: [],
  setMentionArtifacts: (artifacts) => set({ mentionArtifacts: artifacts }),

  // Fetch methods for dynamic data
  fetchSkills: async () => {
    try {
      const { listSkills } = await import("@/lib/api")
      const data = await listSkills()
      set({ skills: data.skills || [] })
    } catch {
      // Silent fail - defaults already set
    }
  },
  fetchAgents: async () => {
    try {
      const { listAgents } = await import("@/lib/api")
      const data = await listAgents()
      set({ agents: data.agents || [] })
    } catch {
      // Silent fail - defaults already set
    }
  },
  fetchKnowledgeBases: async () => {
    try {
      const { listKbSources } = await import("@/lib/api")
      const data = await listKbSources()
      set({ knowledgeBases: data.sources || [] })
    } catch {
      // Silent fail - defaults already set
    }
  },
  fetchMentionArtifacts: async () => {
    try {
      const { listAllArtifacts } = await import("@/lib/api")
      const data = await listAllArtifacts(20)
      set({
        mentionArtifacts: (data.artifacts || []).map((a) => ({
          id: a.id,
          name: a.title,
          type: a.type,
        })),
      })
    } catch {
      // Silent fail - defaults already set
    }
  },
}))
