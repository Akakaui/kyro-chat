"use client"

import { useState, useEffect } from "react"
import {
  X, User, CreditCard, Plug, Shield, Moon, Sun, Type, Volume2,
  Lock, Link2, LogOut, ChevronRight, Key, Globe, Brain, Zap, Code,
  Search, MonitorSmartphone, Plus, Trash2, Loader2, Sparkles,
  Bot, Layers, Settings as SettingsIcon, Sliders
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
import { cn } from "@/lib/utils"

const ACCENT_COLORS = [
  { name: "Amber (Default)", value: "#f59e0b" },
  { name: "Blue", value: "#2563EB" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Green", value: "#22C55E" },
  { name: "Pink", value: "#EC4899" },
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
    browserEnabled,
    persistentBrowser,
    toggleBrowserEnabled,
    togglePersistentBrowser,
  } = useChatStore()

  const settingsQuery = useSettings()
  const [localSettings, setLocalSettings] = useState(settings)
  const [activeTab, setActiveTab] = useState<string>("profile")

  useEffect(() => {
    if (settingsPanelOpen) {
      setLocalSettings(settings)
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

  const navItems = [
    { id: "profile", label: "Profile & Account", icon: User, category: "General" },
    { id: "capabilities", label: "Capabilities & Tools", icon: Zap, category: "General" },
    { id: "connectors", label: "Connectors & MCP", icon: Plug, category: "Integrations" },
    { id: "permissions", label: "Agent Permissions", icon: Shield, category: "Integrations" },
    { id: "connected", label: "API Keys & Models", icon: Key, category: "Integrations" },
    { id: "memory", label: "Memory & Knowledge", icon: Brain, category: "Data" },
    { id: "appearance", label: "Appearance & Theme", icon: localSettings.appearance.theme === "dark" ? Moon : Sun, category: "System" },
    { id: "billing", label: "Plan & Billing", icon: CreditCard, category: "System" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-black/75 backdrop-blur-md transition-all animate-in fade-in duration-200">
      {/* Container Dialog */}
      <div
        style={{
          background: "#0d0d0f",
          borderColor: "#1e1e24",
        }}
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl md:flex-row"
      >
        {/* Modal Navigation Sidebar (Desktop Left / Mobile Header Strip) */}
        <div
          style={{ background: "#111115", borderRight: "1px solid #1a1a20" }}
          className="flex flex-col w-full md:w-64 shrink-0 border-b md:border-b-0"
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between px-4 border-b border-[#1e1e24]">
            <div className="flex items-center gap-2">
              <SettingsIcon size={18} className="text-amber-500" />
              <span className="text-sm font-bold text-gray-100">Settings</span>
            </div>
            <button
              onClick={() => setSettingsPanelOpen(false)}
              className="md:hidden rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* User Card */}
          <div className="p-3 border-b border-[#1a1a20]">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[#17171c] border border-[#22222a]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-400 text-xs font-extrabold text-black">
                {(localSettings.full_name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-100 truncate">
                  {localSettings.full_name || "User"}
                </p>
                <p className="text-[10px] text-amber-500 font-medium">Free Plan</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation List */}
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left",
                      isActive
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "text-gray-400 hover:bg-[#18181f] hover:text-gray-200"
                    )}
                  >
                    <Icon size={15} className={isActive ? "text-amber-400" : "text-gray-400"} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>

          {/* Log out footer */}
          <div className="p-3 border-t border-[#1a1a20]">
            <button
              onClick={() => {
                localStorage.removeItem("token")
                window.location.href = "/"
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 rounded-lg transition-colors hover:bg-red-500/10"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#0d0d0f]">
          {/* Main Top Header Bar */}
          <div className="flex h-14 items-center justify-between border-b border-[#1e1e24] px-6">
            <h2 className="text-sm font-bold text-gray-100 capitalize">
              {navItems.find((n) => n.id === activeTab)?.label || "Settings"}
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs h-8 px-4">
                Save & Close
              </Button>
              <button
                onClick={() => setSettingsPanelOpen(false)}
                className="hidden md:flex rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#1e1e24] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Active Tab View Body */}
          <ScrollArea className="flex-1 p-6">
            <div className="max-w-2xl space-y-6">
              {activeTab === "profile" && (
                <ProfileSection settings={localSettings} setSettings={setLocalSettings} />
              )}
              {activeTab === "capabilities" && (
                <CapabilitiesSection
                  settings={localSettings}
                  setSettings={setLocalSettings}
                  browserEnabled={browserEnabled}
                  persistentBrowser={persistentBrowser}
                  toggleBrowserEnabled={toggleBrowserEnabled}
                  togglePersistentBrowser={togglePersistentBrowser}
                />
              )}
              {activeTab === "connectors" && (
                permissionsPanelOpen && permissionsPanelConnectorId ? (
                  <PermissionsPanel />
                ) : (
                  <ConnectorsPanel />
                )
              )}
              {activeTab === "permissions" && <GlobalPermissionsSection />}
              {activeTab === "connected" && <ConnectedSection />}
              {activeTab === "memory" && <MemoryPanel />}
              {activeTab === "appearance" && (
                <AppearanceSection settings={localSettings} updateAppearance={updateAppearance} />
              )}
              {activeTab === "billing" && <BillingSection />}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

/* ─── Profile Section ─── */
function ProfileSection({ settings, setSettings }: { settings: any; setSettings: (s: any) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-[#141418] border border-[#22222a]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-400 text-lg font-black text-black">
          {(settings.full_name || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-gray-100">{settings.full_name || "User"}</h4>
          <p className="text-xs text-gray-400">Personalize your AI profile details</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-300">Display Name</label>
          <Input
            value={settings.full_name}
            onChange={(e) => setSettings({ ...settings, full_name: e.target.value })}
            placeholder="Your name"
            className="bg-[#141418] border-[#22222a] text-gray-100 focus:border-amber-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-300">Preferred Nickname</label>
          <Input
            value={settings.nickname}
            onChange={(e) => setSettings({ ...settings, nickname: e.target.value })}
            placeholder="What should Kyro call you?"
            className="bg-[#141418] border-[#22222a] text-gray-100 focus:border-amber-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-300">Global System Instructions</label>
          <Textarea
            value={settings.custom_instructions}
            onChange={(e) => setSettings({ ...settings, custom_instructions: e.target.value })}
            placeholder="Custom instructions applied to all chats (e.g. Prefer TypeScript, keep answers concise)..."
            rows={5}
            className="bg-[#141418] border-[#22222a] text-gray-100 focus:border-amber-500"
          />
        </div>
      </div>
    </div>
  )
}

/* ─── Appearance Section ─── */
function AppearanceSection({ settings, updateAppearance }: { settings: any; updateAppearance: (p: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Theme Mode</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "dark" as const, label: "Dark Mode", icon: Moon },
            { key: "light" as const, label: "Light Mode", icon: Sun },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => updateAppearance({ theme: key })}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-4 text-xs font-semibold transition-all",
                settings.appearance.theme === key
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-400 shadow-lg"
                  : "border-[#22222a] bg-[#141418] text-gray-400 hover:bg-[#18181f]"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Accent Palette</h3>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENT_COLORS.map((c) => {
            const active = settings.appearance.accent === c.value
            return (
              <button
                key={c.value}
                title={c.name}
                onClick={() => updateAppearance({ accent: c.value })}
                className={cn(
                  "h-8 w-8 rounded-full transition-all flex items-center justify-center",
                  active ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-black" : "hover:scale-110 opacity-80"
                )}
                style={{ backgroundColor: c.value }}
              />
            )
          })}
        </div>
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
    { key: "web_search" as const, icon: Search, label: "Web Search", desc: "Allows agent to perform web queries" },
    { key: "artifacts" as const, icon: Code, label: "Artifact Engine", desc: "Generates code, markdown, and visual documents" },
    { key: "code_execution" as const, icon: MonitorSmartphone, label: "Code Execution Sandbox", desc: "Runs code directly in isolated sandbox environment" },
    { key: "memory" as const, icon: Brain, label: "Cross-Chat Memory", desc: "Retains facts and preferences across conversation threads" },
  ]

  return (
    <div className="space-y-4">
      {/* Dedicated Browser Capability */}
      <div className="rounded-xl border border-[#22222a] bg-[#141418] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-amber-500" />
            <div>
              <div className="text-xs font-semibold text-gray-100">Live Web Browser Agent</div>
              <div className="text-[11px] text-gray-400">Controls browser sessions to interact with websites</div>
            </div>
          </div>
          <button
            onClick={toggleBrowserEnabled}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              browserEnabled ? "bg-amber-500" : "bg-gray-800"
            )}
          >
            <span className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
              browserEnabled ? "left-[18px]" : "left-0.5"
            )} />
          </button>
        </div>
      </div>

      {/* Capabilities List */}
      {caps.map(({ key, icon: Icon, label, desc }) => (
        <div key={key} className="flex items-center justify-between rounded-xl border border-[#22222a] bg-[#141418] p-4">
          <div className="flex items-center gap-3">
            <Icon size={18} className="text-amber-500" />
            <div>
              <div className="text-xs font-semibold text-gray-100">{label}</div>
              <div className="text-[11px] text-gray-400">{desc}</div>
            </div>
          </div>
          <button
            onClick={() => setSettings({
              ...settings,
              capabilities: { ...settings.capabilities, [key]: !settings.capabilities[key] },
            })}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              settings.capabilities[key] ? "bg-amber-500" : "bg-gray-800"
            )}
          >
            <span className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
              settings.capabilities[key] ? "left-[18px]" : "left-0.5"
            )} />
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#22222a] bg-[#141418] p-4">
        <h4 className="text-xs font-semibold text-gray-100 mb-1">Custom API Providers</h4>
        <p className="text-[11px] text-gray-400 mb-3">
          Configure API keys for OpenAI, Anthropic, Google Gemini, OpenRouter, and more.
        </p>
        <ModelsPage />
      </div>
    </div>
  )
}
