"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Cpu,
  Zap,
  Clock,
  AlertCircle,
  Check,
  ChevronDown,
  RefreshCw,
  Wifi,
  WifiOff,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import {
  fetchModels,
  checkModel,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  validateApiKey,
  type Model,
  type ModelUsageWindow,
  type ApiKey,
} from "@/lib/api"

interface ModelWithUsage extends Model {
  usage?: {
    used: number
    limit: number
    remaining: number
    percentUsed: number
    exhausted: boolean
  }
}

export function ModelsPage() {
  const { selectedModel, setSelectedModel } = useChatStore()
  const [models, setModels] = useState<ModelWithUsage[]>([])
  const [window, setWindow] = useState<ModelUsageWindow | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  // BYOK state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [showAddKey, setShowAddKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyValue, setNewKeyValue] = useState("")
  const [newKeyProvider, setNewKeyProvider] = useState<string>("openai")
  const [newKeyBaseURL, setNewKeyBaseURL] = useState("")
  const [showKeyValue, setShowKeyValue] = useState<Record<string, boolean>>({})
  const [addKeyLoading, setAddKeyLoading] = useState(false)
  const [addKeyError, setAddKeyError] = useState("")

  const loadApiKeys = useCallback(async () => {
    try {
      const data = await listApiKeys()
      setApiKeys(data.keys || [])
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) return
    setAddKeyLoading(true)
    setAddKeyError("")
    try {
      const result = await createApiKey(
        newKeyProvider,
        newKeyValue.trim(),
        newKeyName || `${newKeyProvider} key`,
        newKeyBaseURL.trim() || undefined
      )
      // Add created_at to match ApiKey interface
      const newKey: ApiKey = { ...result, created_at: Date.now() }
      setApiKeys((prev) => [...prev, newKey])
      setShowAddKey(false)
      setNewKeyName("")
      setNewKeyValue("")
      setNewKeyProvider("openai")
      setNewKeyBaseURL("")
      loadModels() // Refresh models after adding key
    } catch (err: unknown) {
      setAddKeyError(err instanceof Error ? err.message : "Failed to add API key")
    } finally {
      setAddKeyLoading(false)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    try {
      await deleteApiKey(keyId)
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId))
      loadModels()
    } catch {
      // Silent fail
    }
  }

  const PROVIDERS = [
    { id: "openai", name: "OpenAI", placeholder: "sk-...", needsBaseURL: false },
    { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-...", needsBaseURL: false },
    { id: "google", name: "Google (Gemini)", placeholder: "AI...", needsBaseURL: false },
    { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", needsBaseURL: false },
    { id: "deepseek", name: "DeepSeek", placeholder: "sk-...", needsBaseURL: false },
    { id: "groq", name: "Groq", placeholder: "gsk_...", needsBaseURL: false },
    { id: "together", name: "Together AI", placeholder: "...", needsBaseURL: false },
    { id: "fireworks", name: "Fireworks AI", placeholder: "fw_...", needsBaseURL: false },
    { id: "mistral", name: "Mistral", placeholder: "mist-...", needsBaseURL: false },
    { id: "qwen", name: "Qwen (Alibaba)", placeholder: "sk-...", needsBaseURL: false },
    { id: "ollama", name: "Ollama (Local)", placeholder: "ollama", needsBaseURL: true, defaultBaseURL: "http://localhost:11434/v1" },
    { id: "custom", name: "Custom (OpenAI-compatible)", placeholder: "any key", needsBaseURL: true, defaultBaseURL: "https://your-api.com/v1" },
  ]

  const loadModels = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchModels()
      setModels(data.models)
      setWindow(data.window)
    } catch (err) {
      console.error("Failed to load models:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadModels()
    // Refresh every 30 seconds
    const interval = setInterval(loadModels, 30000)
    return () => clearInterval(interval)
  }, [loadModels])

  const handleSelectModel = (model: ModelWithUsage) => {
    if (!model.available || model.usage?.exhausted) return
    setSelectedModel({
      id: model.id,
      name: model.name,
      provider: model.provider,
      available: model.available,
      tier: model.tier,
    })
  }

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  // Group models by provider
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, ModelWithUsage[]>)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Models</h2>
          <p className="text-xs text-text-muted">
            Select a model for your conversations
          </p>
        </div>
        {window && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5">
            <Clock size={12} className="text-text-muted" />
            <span className="text-[11px] text-text-secondary">
              Refills in {formatTime(window.secondsUntilRefill)}
            </span>
          </div>
        )}
      </div>

      {/* Models by provider */}
      {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
        <div key={provider} className="space-y-2">
          <h3 className="text-xs font-medium uppercase text-text-muted">
            {provider}
          </h3>
          <div className="space-y-2">
            {providerModels.map((model) => {
              const isSelected = selectedModel.id === model.id
              const isExpanded = expandedModel === model.id
              const isExhausted = model.usage?.exhausted
              const percentUsed = model.usage?.percentUsed || 0

              return (
                <div
                  key={model.id}
                  className={cn(
                    "overflow-hidden rounded-xl border transition-colors",
                    isSelected
                      ? "border-accent/50 bg-accent/5"
                      : "border-border bg-bg-secondary hover:border-border/80",
                    !model.available && "opacity-50",
                    isExhausted && "opacity-70"
                  )}
                >
                  {/* Model row */}
                  <button
                    onClick={() => {
                      if (model.available && !isExhausted) {
                        handleSelectModel(model)
                      }
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    {/* Status indicator */}
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        isSelected ? "bg-accent/20" : "bg-bg-tertiary"
                      )}
                    >
                      {model.tier === "fast" ? (
                        <Zap
                          size={16}
                          className={isSelected ? "text-accent" : "text-text-muted"}
                        />
                      ) : (
                        <Cpu
                          size={16}
                          className={isSelected ? "text-accent" : "text-text-muted"}
                        />
                      )}
                    </div>

                    {/* Name + tier */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {model.name}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                            <Check size={10} />
                            Active
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            model.tier === "fast"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-blue-500/10 text-blue-400"
                          )}
                        >
                          {model.tier === "fast" ? "Fast" : "Pro"}
                        </span>
                      </div>

                      {/* Usage bar */}
                      {model.usage && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isExhausted
                                  ? "bg-red-500"
                                  : percentUsed > 80
                                  ? "bg-amber-500"
                                  : "bg-accent"
                              )}
                              style={{ width: `${Math.min(100, percentUsed)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-text-muted">
                            {formatTokens(model.usage.used)} / {formatTokens(model.usage.limit)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Connection status + expand */}
                    <div className="flex items-center gap-2">
                      {model.available ? (
                        <Wifi size={14} className="text-emerald-400" />
                      ) : (
                        <WifiOff size={14} className="text-text-muted" />
                      )}
                      <ChevronDown
                        size={14}
                        className={cn(
                          "text-text-muted transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3">
                      <div className="space-y-2 text-xs text-text-secondary">
                        <div className="flex justify-between">
                          <span>Provider</span>
                          <span className="capitalize">{model.provider}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Model ID</span>
                          <span className="font-mono text-text-muted">{model.id}</span>
                        </div>
                        {model.usage && (
                          <>
                            <div className="flex justify-between">
                              <span>Remaining</span>
                              <span
                                className={
                                  isExhausted ? "text-red-400" : "text-emerald-400"
                                }
                              >
                                {isExhausted
                                  ? "Exhausted — refills in " +
                                    formatTime(window?.secondsUntilRefill || 0)
                                  : formatTokens(model.usage.remaining) + " tokens"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>API Key</span>
                              <span
                                className={
                                  model.available ? "text-emerald-400" : "text-red-400"
                                }
                              >
                                {model.available ? "Connected" : "Not configured"}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {models.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle size={32} className="mb-3 text-text-muted" />
          <p className="text-sm text-text-secondary">No models available</p>
          <p className="text-xs text-text-muted">
            Add an API key in Settings → Connected to enable models
          </p>
        </div>
      )}

      {/* BYOK Section */}
      <div className="mt-8 border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-primary">Bring Your Own Keys</h3>
          </div>
          <button
            onClick={() => setShowAddKey(!showAddKey)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-bg-secondary hover:bg-bg-tertiary rounded-lg text-text-primary transition-colors"
          >
            <Plus size={14} />
            Add Key
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Add your own API keys to use your provider accounts directly. Keys are encrypted at rest.
        </p>

        {/* Add Key Form */}
        {showAddKey && (
          <div className="mb-4 p-4 bg-bg-secondary rounded-xl border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text-primary">Add API Key</span>
              <button
                onClick={() => setShowAddKey(false)}
                className="text-text-muted hover:text-text-primary text-xs"
              >
                Cancel
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Provider</label>
                <select
                  value={newKeyProvider}
                  onChange={(e) => {
                    setNewKeyProvider(e.target.value)
                    const p = PROVIDERS.find((p) => p.id === e.target.value)
                    if (p?.needsBaseURL && p.defaultBaseURL) {
                      setNewKeyBaseURL(p.defaultBaseURL)
                    } else {
                      setNewKeyBaseURL("")
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {PROVIDERS.find((p) => p.id === newKeyProvider)?.needsBaseURL && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Base URL</label>
                  <input
                    type="text"
                    value={newKeyBaseURL}
                    onChange={(e) => setNewKeyBaseURL(e.target.value)}
                    placeholder={PROVIDERS.find((p) => p.id === newKeyProvider)?.defaultBaseURL}
                    className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                  />
                  <p className="mt-1 text-[10px] text-text-muted">
                    Must be an OpenAI-compatible endpoint (e.g. /v1)
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs text-text-muted mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={`${PROVIDERS.find((p) => p.id === newKeyProvider)?.name} key`}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">API Key</label>
                <input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder={PROVIDERS.find((p) => p.id === newKeyProvider)?.placeholder}
                  className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />
              </div>
              {addKeyError && (
                <p className="text-xs text-red-400">{addKeyError}</p>
              )}
              <button
                onClick={handleAddKey}
                disabled={!newKeyValue.trim() || addKeyLoading}
                className={cn(
                  "w-full py-2 text-sm font-medium rounded-lg transition-colors",
                  newKeyValue.trim() && !addKeyLoading
                    ? "bg-accent text-white hover:opacity-90"
                    : "bg-bg-tertiary text-text-muted cursor-not-allowed"
                )}
              >
                {addKeyLoading ? "Adding..." : "Add Key"}
              </button>
            </div>
          </div>
        )}

        {/* Existing Keys */}
        <div className="space-y-2">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <Key size={14} className="text-text-muted" />
                <div>
                  <div className="text-sm text-text-primary">{key.name}</div>
                  <div className="text-xs text-text-muted">
                    {key.provider} • {key.id.slice(-8)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDeleteKey(key.id)}
                className="p-1.5 text-text-muted hover:text-red-400 transition-colors"
                title="Remove key"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {apiKeys.length === 0 && !showAddKey && (
            <div className="text-center py-6">
              <Key size={24} className="mx-auto mb-2 text-text-muted opacity-50" />
              <p className="text-xs text-text-muted">No custom API keys added yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
