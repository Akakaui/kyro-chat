"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  X, User, CreditCard, Plug, Shield, Moon, Sun, Type, Volume2, Vibrate,
  Lock, Link2, LogOut, ChevronRight, Check, Eye, EyeOff, Plus, Trash2,
  Loader2, CheckCircle2, XCircle, Key, Globe, Brain, Zap, Code, Image,
  Search, MonitorSmartphone, Upload, Database
} from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useSettings } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ConnectorsPanel } from "@/components/connectors/ConnectorsPanel"
import { ModelsPage } from "@/components/models/ModelsPage"
import { MemoryPanel } from "@/components/memory/MemoryPanel"
import { BillingSection } from "@/components/settings/BillingSection"
import {
  PermissionsPanel,
  GlobalPermissionsSection,
} from "@/components/permissions/PermissionsPanel"
import {
  listApiKeys, createApiKey, deleteApiKey, validateApiKey,
  type ApiKey
} from "@/lib/api"

const ACCENT_COLORS = [
  { name: "Blue", value: "#2563EB" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Green", value: "#22C55E" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
  { name: "Red", value: "#EF4444" },
]

export function SettingsPanel() {
  const {
    settingsPanelOpen,
    setSettingsPanelOpen,
    settings,
    setSettings,
    setAppearance,
    permissionsPanelOpen,
    permissionsPanelConnectorId,
    setPermissionsPanelOpen,
    browserEnabled,
    persistentBrowser,
    toggleBrowserEnabled,
    togglePersistentBrowser,
  } = useChatStore()

  const settingsQuery = useSettings()
  const [localSettings, setLocalSettings] = useState(settings)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  useEffect(() => {
    if (settingsPanelOpen) {
      setLocalSettings(settings)
      setActiveSection(null)
    }
  }, [settingsPanelOpen, settings])

  if (!settingsPanelOpen) return null

  const handleSave = () => {
    setSettings(localSettings)
    setAppearance(localSettings.appearance)
    settingsQuery.update.mutate(localSettings)
    setSettingsPanelOpen(false)
  }

  const updateAppearance = (patch: Partial<typeof localSettings.appearance>) => {
    setLocalSettings({
      ...localSettings,
      appearance: { ...localSettings.appearance, ...patch },
    })
  }

  const sections = [
    { id: "profile", icon: User, label: "Profile", subtitle: localSettings.full_name || "User" },
    { id: "billing", icon: CreditCard, label: "Billing", subtitle: "Free Plan" },
    null as null,
    { id: "capabilities", icon: Zap, label: "Capabilities", subtitle: `${Object.values(localSettings.capabilities).filter(Boolean).length} enabled` },
    { id: "connectors", icon: Plug, label: "Connectors", subtitle: "MCP & APIs" },
    { id: "permissions", icon: Shield, label: "Permissions", subtitle: "Tool access" },
    { id: "knowledge", icon: Globe, label: "Knowledge Base", subtitle: "Files & documents" },
    null as null,
    { id: "appearance", icon: localSettings.appearance.theme === "dark" ? Moon : Sun, label: "Color mode", subtitle: localSettings.appearance.theme === "dark" ? "Dark" : "Light" },
    { id: "font", icon: Type, label: "Font style", subtitle: localSettings.appearance.fontSize === "sm" ? "Small" : localSettings.appearance.fontSize === "lg" ? "Large" : "Default" },
    { id: "voice", icon: Volume2, label: "Voice", subtitle: "Text to speech" },
    null as null,
    { id: "haptic", icon: Vibrate, label: "Haptic feedback", subtitle: null, toggle: true },
    { id: "privacy", icon: Lock, label: "Privacy", subtitle: "Data & storage" },
    { id: "shared", icon: Link2, label: "Shared links", subtitle: "Manage shared chats" },
    null as null,
    { id: "connected", icon: Key, label: "Connected", subtitle: "API keys" },
    { id: "models", icon: Brain, label: "Models", subtitle: "Usage & limits" },
    { id: "memory", icon: Globe, label: "Memory", subtitle: "Context across chats" },
  ]

  const sectionGroups = [
    sections.slice(0, 3),
    sections.slice(3, 7),
    sections.slice(7, 10),
    sections.slice(10, 13),
    sections.slice(13, 16),
  ].filter(g => g.length > 0)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setSettingsPanelOpen(false)} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-bg-primary animate-in slide-in-from-right duration-300">
        {activeSection === null ? (
          <>
            {/* Main settings list */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <div />
              <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
              <button
                onClick={() => setSettingsPanelOpen(false)}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                {/* User card */}
                <div className="mb-4 rounded-xl border border-border bg-bg-secondary p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple to-accent text-sm font-bold text-white">
                        {(localSettings.full_name || "U").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {localSettings.full_name || "User"}
                        </p>
                        <p className="text-xs text-text-muted">Free Plan</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-bg-tertiary px-2.5 py-1 text-[10px] font-medium text-text-muted">
                      Free
                    </span>
                  </div>
                </div>

                {/* Upgrade card */}
                <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <h3 className="text-sm font-semibold text-text-primary">Want more Kyro?</h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    Upgrade for more usage and capabilities.
                  </p>
                  <Button size="sm" className="mt-3" variant="outline">
                    Upgrade
                  </Button>
                </div>

                {/* Settings sections */}
                {sectionGroups.map((group, gi) => (
                  <div key={gi} className="mb-3 rounded-xl border border-border bg-bg-secondary overflow-hidden">
                    {group.map((item, i) => {
                      if (item === null) return null
                      const Icon = item.icon
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.toggle) {
                              updateAppearance({ theme: localSettings.appearance.theme === "dark" ? "light" : "dark" })
                            } else {
                              setActiveSection(item.id)
                            }
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover ${
                            i < group.length - 1 ? "border-b border-border" : ""
                          }`}
                        >
                          <Icon size={18} className="shrink-0 text-text-muted" />
                          <div className="flex-1 text-left">
                            <div className="text-sm text-text-primary">{item.label}</div>
                            {item.subtitle && (
                              <div className="text-xs text-text-muted">{item.subtitle}</div>
                            )}
                          </div>
                          {item.toggle ? (
                            <div
                              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                                localSettings.appearance.theme === "dark" ? "bg-accent" : "bg-bg-tertiary"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                  localSettings.appearance.theme === "dark" ? "left-[18px]" : "left-0.5"
                                }`}
                              />
                            </div>
                          ) : (
                            <ChevronRight size={16} className="shrink-0 text-text-muted" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}

                {/* Log out */}
                <div className="mb-4 rounded-xl border border-border bg-bg-secondary overflow-hidden">
                  <button
                    onClick={() => {
                      localStorage.removeItem("token")
                      window.location.href = "/"
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-danger transition-colors hover:bg-red-500/5"
                  >
                    <LogOut size={18} />
                    <span className="text-sm">Log out</span>
                  </button>
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            {/* Sub-page */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-1 text-sm text-accent hover:underline"
              >
                ← Settings
              </button>
              <h2 className="text-sm font-semibold text-text-primary capitalize">{activeSection}</h2>
              <button
                onClick={() => setSettingsPanelOpen(false)}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                {activeSection === "profile" && (
                  <ProfileSection settings={localSettings} setSettings={setLocalSettings} />
                )}
                {activeSection === "appearance" && (
                  <AppearanceSection settings={localSettings} updateAppearance={updateAppearance} />
                )}
                {activeSection === "font" && (
                  <FontSection settings={localSettings} updateAppearance={updateAppearance} />
                )}
                {activeSection === "connected" && <ConnectedSection />}
                {activeSection === "models" && <ModelsPage />}
                {activeSection === "memory" && <MemoryPanel />}
                {activeSection === "capabilities" && (
                  <CapabilitiesSection
                    settings={localSettings}
                    setSettings={setLocalSettings}
                    browserEnabled={browserEnabled}
                    persistentBrowser={persistentBrowser}
                    toggleBrowserEnabled={toggleBrowserEnabled}
                    togglePersistentBrowser={togglePersistentBrowser}
                  />
                )}
                {activeSection === "connectors" && (
                  permissionsPanelOpen && permissionsPanelConnectorId ? (
                    <PermissionsPanel />
                  ) : (
                    <ConnectorsPanel />
                  )
                )}
                {activeSection === "permissions" && <GlobalPermissionsSection />}
                {activeSection === "knowledge" && <KnowledgeBaseSection />}
                {activeSection === "privacy" && <PrivacySection />}
                {activeSection === "voice" && <VoiceSection />}
                {activeSection === "haptic" && <div className="text-sm text-text-secondary p-4">Haptic feedback settings coming soon.</div>}
                {activeSection === "shared" && <SharedLinksSection />}
                {activeSection === "billing" && <BillingSection />}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </>
  )
}

/* ─── Profile Section ─── */
function ProfileSection({ settings, setSettings }: { settings: any; setSettings: (s: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple to-accent text-xl font-bold text-white">
          {(settings.full_name || "U").charAt(0).toUpperCase()}
        </div>
        <Button variant="outline" size="sm">Change avatar</Button>
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Full Name</label>
        <Input
          value={settings.full_name}
          onChange={(e) => setSettings({ ...settings, full_name: e.target.value })}
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Nickname</label>
        <Input
          value={settings.nickname}
          onChange={(e) => setSettings({ ...settings, nickname: e.target.value })}
          placeholder="What should I call you?"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-text-secondary">Custom Instructions</label>
        <Textarea
          value={settings.custom_instructions}
          onChange={(e) => setSettings({ ...settings, custom_instructions: e.target.value })}
          placeholder="Add instructions that apply to all conversations..."
          rows={4}
        />
      </div>
    </div>
  )
}

/* ─── Appearance Section ─── */
function AppearanceSection({ settings, updateAppearance }: { settings: any; updateAppearance: (p: any) => void }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-medium uppercase text-text-muted">Mode</h3>
        <div className="flex gap-2">
          {[
            { key: "dark" as const, label: "Dark", icon: Moon },
            { key: "light" as const, label: "Light", icon: Sun },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => updateAppearance({ theme: key })}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                settings.appearance.theme === key
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-medium uppercase text-text-muted">Accent Color</h3>
        <div className="flex items-center gap-3">
          {ACCENT_COLORS.map((c) => {
            const active = settings.appearance.accent === c.value
            return (
              <button
                key={c.value}
                title={c.name}
                onClick={() => updateAppearance({ accent: c.value })}
                className={`h-8 w-8 rounded-full transition-all ${active ? "scale-110" : "hover:scale-110"}`}
                style={{
                  backgroundColor: c.value,
                  boxShadow: active ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c.value}` : undefined,
                }}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

/* ─── Font Section ─── */
function FontSection({ settings, updateAppearance }: { settings: any; updateAppearance: (p: any) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium uppercase text-text-muted">Font Size</h3>
      <div className="flex gap-2">
        {[
          { key: "sm" as const, label: "Small" },
          { key: "md" as const, label: "Default" },
          { key: "lg" as const, label: "Large" },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => updateAppearance({ fontSize: opt.key })}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm transition-colors ${
              settings.appearance.fontSize === opt.key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Capabilities Section ─── */
function CapabilitiesSection({
  settings,
  setSettings,
  browserEnabled,
  persistentBrowser,
  toggleBrowserEnabled,
  togglePersistentBrowser,
}: {
  settings: any
  setSettings: (s: any) => void
  browserEnabled: boolean
  persistentBrowser: boolean
  toggleBrowserEnabled: () => void
  togglePersistentBrowser: () => void
}) {
  const caps = [
    { key: "web_search" as const, icon: Search, label: "Web Search", desc: "Search the web for information" },
    { key: "artifacts" as const, icon: Code, label: "Artifacts", desc: "Generate code and documents" },
    { key: "code_execution" as const, icon: MonitorSmartphone, label: "Code Execution", desc: "Run code in sandbox" },
    { key: "memory" as const, icon: Brain, label: "Memory", desc: "Remember across conversations" },
  ]

  return (
    <div className="space-y-4">
      {/* Browser capability (dedicated) */}
      <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-text-muted" />
            <div>
              <div className="text-sm text-text-primary">Browser</div>
              <div className="text-xs text-text-muted">Browse websites directly with KasmWeb</div>
            </div>
          </div>
          <button
            onClick={toggleBrowserEnabled}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              browserEnabled ? "bg-accent" : "bg-bg-tertiary"
            }`}
            aria-label={browserEnabled ? "Disable browser" : "Enable browser"}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              browserEnabled ? "left-[18px]" : "left-0.5"
            }`} />
          </button>
        </div>

        {browserEnabled && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">Persistent browser</div>
                <div className="text-xs text-text-muted">
                  Keep cookies, history, and sign-ins across sessions
                </div>
              </div>
              <button
                onClick={togglePersistentBrowser}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  persistentBrowser ? "bg-accent" : "bg-bg-tertiary"
                }`}
                aria-label={persistentBrowser ? "Disable persistent browser" : "Enable persistent browser"}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  persistentBrowser ? "left-[18px]" : "left-0.5"
                }`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Other capabilities */}
      {caps.map(({ key, icon: Icon, label, desc }) => (
        <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-bg-secondary px-4 py-3">
          <div className="flex items-center gap-3">
            <Icon size={18} className="text-text-muted" />
            <div>
              <div className="text-sm text-text-primary">{label}</div>
              <div className="text-xs text-text-muted">{desc}</div>
            </div>
          </div>
          <button
            onClick={() => setSettings({
              ...settings,
              capabilities: { ...settings.capabilities, [key]: !settings.capabilities[key] },
            })}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              settings.capabilities[key] ? "bg-accent" : "bg-bg-tertiary"
            }`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              settings.capabilities[key] ? "left-[18px]" : "left-0.5"
            }`} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ─── Connected Section (API Keys CRUD) ─── */
function ConnectedSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)

  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    try {
      setLoading(true)
      const data = await listApiKeys()
      setApiKeys(data.keys || [])
    } catch (err) {
      console.error("Failed to load API keys:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteApiKey(deleteTarget.id)
      setApiKeys(prev => prev.filter(k => k.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error("Failed to delete API key:", err)
    }
  }

  const providerColors: Record<string, string> = {
    openai: "#22C55E",
    anthropic: "#F59E0B",
    google: "#3B82F6",
    openrouter: "#8B5CF6",
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Add your own API keys. These are stored securely and sent directly to the providers.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
          <Key size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm text-text-secondary">No API keys added</p>
          <p className="mt-1 text-xs text-text-muted">
            Add keys to use your own provider accounts
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3"
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: providerColors[key.provider] || "var(--color-text-muted)" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{key.name || key.provider}</div>
                <div className="text-xs text-text-muted capitalize">{key.provider}</div>
              </div>
              <button
                onClick={() => setDeleteTarget(key)}
                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-500/10 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => setAddOpen(true)} className="w-full" variant="outline">
        <Plus size={16} className="mr-2" />
        Add API Key
      </Button>

      {addOpen && <AddKeyModal onClose={() => setAddOpen(false)} onAdded={loadKeys} />}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-text-primary">Delete API Key</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Delete <span className="font-medium text-text-primary">{deleteTarget.name || deleteTarget.provider}</span>? This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Add Key Modal ─── */
function AddKeyModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [provider, setProvider] = useState("openai")
  const [name, setName] = useState("")
  const [apiKeyValue, setApiKeyValue] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validStatus, setValidStatus] = useState<"idle" | "valid" | "invalid">("idle")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const providers = [
    { id: "openai", name: "OpenAI", placeholder: "sk-..." },
    { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
    { id: "google", name: "Google AI", placeholder: "AIza..." },
    { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
  ]

  const handleValidate = async () => {
    if (!apiKeyValue) return
    setValidating(true)
    setValidStatus("idle")
    try {
      const result = await validateApiKey(provider, apiKeyValue)
      setValidStatus(result.valid ? "valid" : "invalid")
    } catch {
      setValidStatus("invalid")
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    if (!apiKeyValue) return
    setSaving(true)
    setError("")
    try {
      await createApiKey(provider, apiKeyValue, name || undefined)
      onAdded()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to save key")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text-primary">Add API Key</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-bg-hover">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary">Provider</label>
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value); setValidStatus("idle") }}
              className="mt-1.5 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-secondary">Name (optional)</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My OpenAI Key"
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">API Key</label>
            <div className="relative mt-1.5">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKeyValue}
                onChange={(e) => { setApiKeyValue(e.target.value); setValidStatus("idle") }}
                placeholder={providers.find(p => p.id === provider)?.placeholder}
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {apiKeyValue && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={validating}
              className="w-full"
            >
              {validating ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Validating...</>
              ) : validStatus === "valid" ? (
                <><CheckCircle2 size={14} className="mr-2 text-success" /> Key is valid</>
              ) : validStatus === "invalid" ? (
                <><XCircle size={14} className="mr-2 text-danger" /> Key is invalid</>
              ) : (
                "Validate Key"
              )}
            </Button>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={!apiKeyValue || saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Privacy Section ─── */
function PrivacySection() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-medium text-text-primary">Data Storage</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Your conversations and data are stored locally on this device. We never share your data with third parties.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-medium text-text-primary">Model Training</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Your conversations are not used to train AI models. Your data stays private.
        </p>
      </div>
    </div>
  )
}

/* ─── Voice Section ─── */
function VoiceSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-medium text-text-primary">Text to Speech</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Configure voice output for assistant responses.
        </p>
        <div className="mt-3">
          <label className="text-xs text-text-secondary">Voice Speed</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            defaultValue="1"
            className="mt-1.5 w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>0.5x</span>
            <span>1x</span>
            <span>2x</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Shared Links Section ─── */
function SharedLinksSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
        <Link2 size={24} className="mx-auto mb-2 text-text-muted" />
        <p className="text-sm text-text-secondary">No shared links</p>
        <p className="mt-1 text-xs text-text-muted">
          Share a conversation to create a link
        </p>
      </div>
    </div>
  )
}

/* ─── Knowledge Base Section ─── */
function KnowledgeBaseSection() {
  const [sources, setSources] = useState<Array<{ kb_id: string; source_file: string; chunk_count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSources()
  }, [])

  async function loadSources() {
    setLoading(true)
    try {
      const { listKbSources } = await import("@/lib/api")
      const data = await listKbSources()
      setSources(data.sources || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { uploadKbFile } = await import("@/lib/api")
      await uploadKbFile(file)
      await loadSources()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete(kbId: string) {
    if (!confirm("Delete this knowledge base?")) return
    try {
      const { deleteKbSource } = await import("@/lib/api")
      await deleteKbSource(kbId)
      await loadSources()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Upload files to your global knowledge base. Agents with "allow" permission will have these files auto-injected as context.
      </p>

      {/* Upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
          uploading ? "border-accent/50 bg-accent/5" : "border-border hover:border-accent/30 hover:bg-bg-secondary"
        }`}
      >
        {uploading ? (
          <Loader2 size={16} className="animate-spin text-accent" />
        ) : (
          <Upload size={16} className="text-text-muted" />
        )}
        <span className="text-sm text-text-secondary">
          {uploading ? "Uploading..." : "Click to upload file"}
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
        onChange={handleUpload}
        className="hidden"
      />

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 rounded p-2">{error}</div>
      )}

      {/* Sources list */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-secondary p-4 text-center">
          <Database size={20} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm text-text-secondary">No files uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.kb_id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary p-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Database size={14} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{source.source_file}</p>
                  <p className="text-[10px] text-text-muted">{source.chunk_count} chunks</p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(source.kb_id)}
                className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-red-500 transition-colors shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
