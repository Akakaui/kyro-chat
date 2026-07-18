import { create } from "zustand"
import type { Conversation, Message, Artifact, UserSettings, Model } from "@/lib/api"
import { AVAILABLE_MODELS } from "@/lib/api"

interface ChatState {
  // Conversations
  conversations: Conversation[]
  activeConversation: string | null
  setConversations: (conversations: Conversation[]) => void
  setActiveConversation: (id: string | null) => void
  addConversation: (conversation: Conversation) => void
  removeConversation: (id: string) => void
  updateConversationLocal: (id: string, data: Partial<Conversation>) => void

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

  // Model
  selectedModel: Model
  setSelectedModel: (model: Model) => void

  // Incognito
  incognito: boolean
  toggleIncognito: () => void

  // Artifacts
  artifacts: Artifact[]
  setArtifacts: (artifacts: Artifact[]) => void
  addArtifact: (artifact: Artifact) => void
  artifactViewerOpen: boolean
  setArtifactViewerOpen: (open: boolean) => void
  activeArtifact: Artifact | null
  setActiveArtifact: (artifact: Artifact | null) => void

  // Overlay states
  addToChatOverlayOpen: boolean
  setAddToChatOverlayOpen: (open: boolean) => void
  modelSelectorOpen: boolean
  setModelSelectorOpen: (open: boolean) => void
  artifactQueueOpen: boolean
  setArtifactQueueOpen: (open: boolean) => void
  shareDialogOpen: boolean
  setShareDialogOpen: (open: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
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
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversation:
        state.activeConversation === id ? null : state.activeConversation,
    })),
  updateConversationLocal: (id, data) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    })),

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
      artifacts: true,
      code_execution: true,
      memory: true,
    },
  },
  setSettings: (settings) => set({ settings }),

  // Model
  selectedModel: AVAILABLE_MODELS[0],
  setSelectedModel: (model) => set({ selectedModel: model }),

  // Incognito
  incognito: false,
  toggleIncognito: () => set((state) => ({ incognito: !state.incognito })),

  // Artifacts
  artifacts: [],
  setArtifacts: (artifacts) => set({ artifacts }),
  addArtifact: (artifact) =>
    set((state) => ({ artifacts: [...state.artifacts, artifact] })),
  artifactViewerOpen: false,
  setArtifactViewerOpen: (open) => set({ artifactViewerOpen: open }),
  activeArtifact: null,
  setActiveArtifact: (artifact) => set({ activeArtifact: artifact }),

  // Overlay states
  artifactQueueOpen: false,
  setArtifactQueueOpen: (open) => set({ artifactQueueOpen: open }),
  addToChatOverlayOpen: false,
  setAddToChatOverlayOpen: (open) => set({ addToChatOverlayOpen: open }),
  modelSelectorOpen: false,
  setModelSelectorOpen: (open) => set({ modelSelectorOpen: open }),
  shareDialogOpen: false,
  setShareDialogOpen: (open) => set({ shareDialogOpen: open }),
}))
