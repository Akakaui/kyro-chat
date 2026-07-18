const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || body.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

// Conversations
export async function listConversations() {
  return request<{ conversations: Conversation[] }>("/api/chat/conversations")
}

export async function createConversation(title?: string) {
  return request<Conversation>("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ title: title || "New conversation" }),
  })
}

export async function deleteConversation(id: string) {
  return request<void>(`/api/chat/conversations/${id}`, { method: "DELETE" })
}

export async function updateConversation(
  id: string,
  data: Partial<Pick<Conversation, "title" | "starred">>
) {
  return request<Conversation>(`/api/chat/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

// Messages
export async function listMessages(conversationId: string) {
  return request<{ messages: Message[] }>(
    `/api/chat/conversations/${conversationId}/messages`
  )
}

export async function sendMessageStream(
  conversationId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError?: (error: string) => void,
  model?: string,
  provider?: string,
  apiKey?: string,
) {
  const token = localStorage.getItem("token")
  const res = await fetch(
    `${API_URL}/api/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, model, provider, apiKey }),
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body.error || body.message || `Request failed: ${res.status}`
    onError?.(msg)
    throw new Error(msg)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    onDone()
    return
  }

  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      if (text) onChunk(text)
    }
  } catch (err: any) {
    onError?.(err.message || "Stream interrupted")
  } finally {
    decoder.decode()
    onDone()
  }
}

// Artifacts
export async function listArtifacts(conversationId: string) {
  return request<{ artifacts: Artifact[] }>(
    `/api/artifacts/conversation/${conversationId}`
  )
}

export async function getArtifact(id: string) {
  return request<Artifact>(`/api/artifacts/${id}`)
}

// Settings
export async function getSettings() {
  return request<UserSettings>("/api/user/settings")
}

export async function updateSettings(data: Partial<UserSettings>) {
  return request<UserSettings>("/api/user/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

// Health
export async function checkHealth() {
  return request<{ status: string }>("/api/health")
}

// Types
export interface Conversation {
  id: string
  title: string
  model: string
  starred: boolean
  created_at: number
  updated_at: number
}

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  artifacts?: Artifact[]
  tool_use?: ToolUse[]
}

export interface Artifact {
  id: string
  title: string
  type: "html" | "react" | "code" | "markdown" | "image"
  content: string
  url?: string
  created_at: number
  size: number
}

export interface ToolUse {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
}

export interface UserSettings {
  full_name: string
  nickname: string
  custom_instructions: string
  capabilities: {
    web_search: boolean
    artifacts: boolean
    code_execution: boolean
    memory: boolean
  }
}

export interface Model {
  id: string
  name: string
  provider: string
  price_per_million?: number
  available: boolean
}

export const AVAILABLE_MODELS: Model[] = [
  { id: "kyro-fast", name: "Kyro Fast", provider: "Kyro", price_per_million: 0, available: true },
  { id: "kyro-pro", name: "Kyro Pro", provider: "Kyro", price_per_million: 0.24, available: true },
  { id: "riva", name: "Riva", provider: "Kyro", price_per_million: 0.13, available: true },
  { id: "astra", name: "Astra", provider: "Kyro", price_per_million: 0.15, available: true },
  { id: "leta", name: "Leta", provider: "Kyro", price_per_million: 0.02, available: true },
  { id: "kyro-free", name: "Kyro 4", provider: "Kyro", price_per_million: 0, available: true },
]
