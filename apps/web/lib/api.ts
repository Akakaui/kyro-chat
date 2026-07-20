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

export async function createConversation(title?: string, projectId?: string) {
  return request<Conversation>("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ title: title || "New conversation", projectId }),
  })
}

export async function deleteConversation(id: string) {
  return request<void>(`/api/chat/conversations/${id}`, { method: "DELETE" })
}

export async function updateConversation(
  id: string,
  data: Partial<Pick<Conversation, "title" | "starred" | "archived">>
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
  signal?: AbortSignal,
  chatMode?: "act" | "build",
  incognito?: boolean,
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
      body: JSON.stringify({ content, model, provider, apiKey, chatMode, incognito }),
      signal,
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
    if (err?.name === "AbortError") return
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

// API Keys (BYOK)
export async function listApiKeys() {
  return request<{ keys: ApiKey[] }>("/api/keys")
}

export async function createApiKey(provider: string, apiKey: string, name?: string) {
  return request<{ id: string; provider: string; name: string }>("/api/keys", {
    method: "POST",
    body: JSON.stringify({ apiKey, name }),
  })
}

export async function deleteApiKey(id: string) {
  return request<void>(`/api/keys/${id}`, { method: "DELETE" })
}

export async function validateApiKey(provider: string, apiKey: string) {
  return request<{ valid: boolean; error?: string }>("/api/keys/validate", {
    method: "POST",
    body: JSON.stringify({ provider, apiKey }),
  })
}

// Agents
export async function listAgents() {
  return request<{ agents: Agent[] }>("/api/agents")
}

export async function createAgent(data: { name: string; type?: string; description?: string; system_prompt?: string; model?: string }) {
  return request<Agent>("/api/agents", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateAgent(id: string, data: Partial<Agent>) {
  return request<Agent>(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteAgent(id: string) {
  return request<void>(`/api/agents/${id}`, { method: "DELETE" })
}

// Skills
export async function listSkills() {
  return request<{ skills: Skill[] }>("/api/skills")
}

export async function createSkill(data: { name: string; description?: string; content: string }) {
  return request<Skill>("/api/skills", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateSkill(id: string, data: Partial<Skill>) {
  return request<Skill>(`/api/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteSkill(id: string) {
  return request<void>(`/api/skills/${id}`, { method: "DELETE" })
}

// Knowledge Bases
export async function listKbSources(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : ""
  return request<{ sources: KbSource[] }>(`/api/kb/sources${params}`)
}

export async function deleteKbSource(kbId: string) {
  return request<void>(`/api/kb/sources/${kbId}`, { method: "DELETE" })
}

export async function uploadKbFile(file: File, agentId?: string, projectId?: string, kbId?: string) {
  const formData = new FormData()
  formData.append("file", file)
  if (agentId) formData.append("agentId", agentId)
  if (projectId) formData.append("projectId", projectId)
  if (kbId) formData.append("kbId", kbId)

  const token = localStorage.getItem("token")
  const res = await fetch(`${API_URL}/api/kb/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Upload failed: ${res.status}`)
  }
  return res.json()
}

// ─── Projects ───

export async function createProject(name: string, description?: string) {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  })
}

export async function listProjects() {
  return request<{ projects: Project[] }>("/api/projects")
}

export async function getProject(id: string) {
  return request<{ project: Project }>(`/api/projects/${id}`)
}

export async function updateProject(id: string, name?: string, description?: string) {
  return request<{ success: boolean }>(`/api/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, description }),
  })
}

export async function deleteProject(id: string) {
  return request<{ success: boolean }>(`/api/projects/${id}`, { method: "DELETE" })
}

export async function listProjectConversations(projectId: string) {
  return request<{ conversations: Conversation[] }>(`/api/projects/${projectId}/conversations`)
}

export async function listProjectKBs(projectId: string) {
  return request<{ kbs: KbSource[] }>(`/api/projects/${projectId}/kbs`)
}

// ─── Agent KB Permissions ───

export async function getAgentKBPermissions(agentId: string) {
  return request<{ permissions: AgentKBPermission[] }>(`/api/agents/${agentId}/kb-permissions`)
}

export async function setAgentKBPermission(agentId: string, kbId: string, permission: "allow" | "ask" | "deny") {
  return request<{ success: boolean; permission: string }>(`/api/agents/${agentId}/kb-permissions`, {
    method: "PUT",
    body: JSON.stringify({ kbId, permission }),
  })
}

export async function getAgentKBAvailable(agentId: string) {
  return request<{ kbs: AgentKBAvailable[] }>(`/api/agents/${agentId}/kb-available`)
}

// Conversations with project support
export async function createConversationWithTitle(title?: string, projectId?: string) {
  return request<Conversation>("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ title: title || "New conversation", projectId }),
  })
}

// Artifacts (global across all conversations)
export async function listAllArtifacts(limit?: number) {
  const params = limit ? `?limit=${limit}` : ""
  return request<{ artifacts: Artifact[] }>(`/api/artifacts${params}`)
}

export async function getArtifactDetail(id: string) {
  return request<{ artifact: Artifact }>(`/api/artifacts/${id}`)
}

export async function deleteArtifact(id: string) {
  return request<void>(`/api/artifacts/${id}`, { method: "DELETE" })
}

// Types
export interface Conversation {
  id: string
  sessionId: string
  title: string
  model: string
  starred: boolean
  archived: boolean
  project_id?: string | null
  created_at: number
  updated_at: number
}

export interface Message {
  id: string
  sessionId?: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  timestamp: number
  artifacts?: Artifact[]
  tool_use?: ToolUse[]
}

export interface Artifact {
  id: string
  title: string
  type: "html" | "react" | "code" | "markdown" | "image" | "csv" | "video" | "mermaid" | "pdf"
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
    browser: boolean
    artifacts: boolean
    code_execution: boolean
    memory: boolean
  }
  appearance: {
    theme: "dark" | "light"
    accent: string
    fontSize: "sm" | "md" | "lg"
  }
}

export interface Model {
  id: string
  name: string
  provider: string
  price_per_million?: number
  available: boolean
  limit?: number
  tier?: 'fast' | 'pro'
  usage?: {
    used: number
    limit: number
    remaining: number
    percentUsed: number
    exhausted: boolean
  }
}

export interface ModelUsageWindow {
  start: number
  end: number
  secondsUntilRefill: number
}

export const AVAILABLE_MODELS: Model[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", available: true, tier: "pro" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", available: true, tier: "fast" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", available: true, tier: "pro" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", available: true, tier: "fast" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", available: true, tier: "pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", available: true, tier: "fast" },
]

export interface ApiKey {
  id: string
  provider: string
  name: string
  maskedKey?: string
  isValid?: boolean
  capabilities?: {
    imageGen: boolean
    models: string[]
    capabilities: string[]
  }
  createdAt?: string
  lastUsedAt?: string | null
  created_at?: number
}

export interface Agent {
  id: string
  name: string
  type: 'primary' | 'sub' | 'both'
  description?: string
  system_prompt?: string
  model?: string
  temperature?: number
  max_tokens?: number
  skills?: string
  permissions?: string
  created_at: number
  updated_at: number
}

export interface Skill {
  id: string
  name: string
  description?: string
  content: string
  is_builtin: boolean
  created_at: number
  updated_at: number
}

export interface KbSource {
  kb_id: string
  source_file: string
  chunk_count: number
  last_updated: number
  project_id?: string | null
}

export interface Project {
  id: string
  name: string
  description?: string
  conversation_count?: number
  kb_count?: number
  created_at: number
  updated_at: number
}

export interface AgentKBPermission {
  id: string
  agent_id: string
  kb_id: string
  permission: "allow" | "ask" | "deny"
  kb_name?: string
  created_at: number
}

export interface AgentKBAvailable {
  kb_id: string
  name: string
  project_id?: string | null
  permission: "allow" | "ask" | "deny"
}

// Model API functions
export async function fetchModels() {
  return request<{ models: Model[]; window: ModelUsageWindow }>("/api/models")
}

export async function checkModel(modelId: string) {
  return request<{ available: boolean; hasKey: boolean; usage: Model['usage']; secondsUntilRefill: number }>(
    `/api/models/${modelId}/check`
  )
}

export async function recordModelUsage(modelId: string, provider: string, tokensUsed: number) {
  return request<{ success: boolean }>("/api/models/usage", {
    method: "POST",
    body: JSON.stringify({ modelId, provider, tokensUsed }),
  })
}

export async function getModelUsageStats() {
  return request<{ usage: Array<{ model_id: string; provider: string; tokens_used: number; tokens_limit: number }>; window: ModelUsageWindow }>(
    "/api/models/usage/stats"
  )
}

// Custom API Connectors
export interface CustomConnector {
  id: string
  name: string
  image?: string
  baseUrl?: string
  endpoints: Array<{ method: string; path: string; description: string }>
  status: "idle" | "discovering" | "ready" | "error"
  createdAt: number
  updatedAt: number
  hasApiKey?: boolean
}

export interface ConnectorTool {
  name: string
  description: string
  method: string
  path: string
  source: string
}

export async function listConnectors() {
  return request<{ connectors: CustomConnector[] }>("/api/connectors")
}

export async function createConnector(name: string, image?: string, apiKey?: string, baseUrl?: string) {
  return request<CustomConnector>("/api/connectors", {
    method: "POST",
    body: JSON.stringify({ name, image, apiKey, baseUrl }),
  })
}

export async function getConnector(id: string) {
  return request<CustomConnector>(`/api/connectors/${id}`)
}

export async function updateConnector(id: string, data: { name?: string; image?: string; baseUrl?: string }) {
  return request<{ success: boolean }>(`/api/connectors/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteConnector(id: string) {
  return request<{ success: boolean }>(`/api/connectors/${id}`, {
    method: "DELETE",
  })
}

export async function discoverEndpoints(id: string) {
  return request<{ endpoints: Array<{ method: string; path: string; description: string }>; status: string }>(
    `/api/connectors/${id}/discover`,
    { method: "POST" }
  )
}

export async function getConnectorTools(id: string) {
  return request<{ tools: ConnectorTool[]; status: string }>(`/api/connectors/${id}/tools`)
}

// Tool Permissions
export interface ToolPermissionGlobals {
  builtin: "allow" | "ask" | "deny"
  mcp: "allow" | "ask" | "deny"
  custom_api: "allow" | "ask" | "deny"
}

export interface ToolPermission {
  toolName: string
  source: "builtin" | "mcp" | "custom_api"
  permission: "allow" | "ask" | "deny"
}

export interface ScheduledTask {
  id: string
  title: string
  prompt: string
  schedule: string
  lastRun: string
  nextRun: string
  status: "active" | "paused" | "completed"
  projectId?: string
  permissionOverride?: boolean
  emailNotification?: boolean
  result?: string
}

export async function getPermissions() {
  return request<{ globals: ToolPermissionGlobals; tools: ToolPermission[] }>("/api/permissions")
}

export async function setGlobalPermission(sourceType: string, permission: string) {
  return request<{ success: boolean }>("/api/permissions/globals", {
    method: "PUT",
    body: JSON.stringify({ sourceType, permission }),
  })
}

export async function getToolPermission(toolName: string) {
  return request<{ toolName: string; source: string | null; permission: string | null; isDefault: boolean }>(
    `/api/permissions/${encodeURIComponent(toolName)}`
  )
}

export async function setToolPermission(toolName: string, source: string, permission: string) {
  return request<{ success: boolean }>(`/api/permissions/${encodeURIComponent(toolName)}`, {
    method: "PUT",
    body: JSON.stringify({ source, permission }),
  })
}

export async function resetToolPermission(toolName: string) {
  return request<{ success: boolean }>(`/api/permissions/${encodeURIComponent(toolName)}`, {
    method: "DELETE",
  })
}

export async function checkToolPermission(toolName: string, source?: string) {
  const params = source ? `?source=${encodeURIComponent(source)}` : ""
  return request<{ permission: string; isDefault: boolean }>(
    `/api/permissions/${encodeURIComponent(toolName)}/check${params}`
  )
}

// Email Settings
export async function getEmailSettings() {
  return request<{
    agentEmail: string
    userEmail: string
    agentDisplayName: string
    notifications: {
      taskComplete: boolean
      scheduledDone: boolean
      actionRequired: boolean
    }
  }>("/api/email/settings")
}

export async function updateEmailSettings(settings: {
  userEmail: string
  agentDisplayName: string
  notifications: {
    taskComplete: boolean
    scheduledDone: boolean
    actionRequired: boolean
  }
}) {
  return request<{ success: boolean }>("/api/email/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  })
}

export async function sendTestEmail(to: string) {
  return request<{ success: boolean }>("/api/email/test", {
    method: "POST",
    body: JSON.stringify({ to }),
  })
}

// Scheduled Tasks
export async function listScheduledTasks(projectId?: string) {
  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""
  return request<{ tasks: ScheduledTask[] }>(`/api/scheduled${params}`)
}

export async function createScheduledTask(task: {
  title: string
  prompt: string
  schedule: string
  projectId?: string
  permissionOverride?: boolean
  emailNotification?: boolean
}) {
  return request<{ task: ScheduledTask }>("/api/scheduled", {
    method: "POST",
    body: JSON.stringify(task),
  })
}

export async function updateScheduledTask(
  id: string,
  data: Partial<{
    title: string
    prompt: string
    schedule: string
    projectId: string
    permissionOverride: boolean
    emailNotification: boolean
    status: string
  }>
) {
  return request<{ task: ScheduledTask }>(`/api/scheduled/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteScheduledTask(id: string) {
  return request<{ success: boolean }>(`/api/scheduled/${id}`, {
    method: "DELETE",
  })
}

// Artifacts - Share & Remix
export async function shareArtifact(artifactId: string) {
  return request<{ hash: string; url: string }>(
    `/api/artifacts/share/${artifactId}`,
    { method: "POST" }
  )
}

export async function remixArtifact(artifactId: string) {
  return request<{ conversationId: string; message: string }>(
    `/api/artifacts/share/${artifactId}/remix`,
    { method: "POST" }
  )
}
