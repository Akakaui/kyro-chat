"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useChatStore } from "@/stores/chat"
import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversation,
  listMessages,
  getSettings,
  updateSettings,
  listArtifacts,
  type Conversation,
  type Message,
  type UserSettings,
  type Artifact,
} from "@/lib/api"

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      try {
        const res = await listConversations()
        return res.conversations || []
      } catch {
        return [] as Conversation[]
      }
    },
    staleTime: 30_000,
  })
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as Message[]
      try {
        const res = await listMessages(conversationId)
        return res.messages || []
      } catch {
        return [] as Message[]
      }
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  })
}

export function useSettings() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      try {
        return await getSettings()
      } catch {
        return {
          full_name: "User",
          nickname: "",
          custom_instructions: "",
          capabilities: {
            web_search: true,
            artifacts: true,
            code_execution: true,
            memory: true,
          },
        } as UserSettings
      }
    },
  })

  const mutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })

  return { ...query, update: mutation }
}

export function useArtifacts(conversationId: string | null) {
  return useQuery({
    queryKey: ["artifacts", conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as Artifact[]
      try {
        const res = await listArtifacts(conversationId)
        return res.artifacts || []
      } catch {
        return [] as Artifact[]
      }
    },
    enabled: !!conversationId,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  const selectedProjectId = useChatStore((s) => s.selectedProjectId)
  return useMutation({
    mutationFn: (title?: string) => createConversation(title, selectedProjectId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] })
    },
  })
}

export function useUpdateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<Conversation, "title" | "starred">> }) =>
      updateConversation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] })
    },
  })
}
