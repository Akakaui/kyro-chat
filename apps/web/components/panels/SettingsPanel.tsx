"use client"

import { useState } from "react"
import { X, Eye, EyeOff, Plus, Trash2, Check } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useSettings } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function SettingsPanel() {
  const { settingsPanelOpen, setSettingsPanelOpen, settings, setSettings } =
    useChatStore()

  const settingsQuery = useSettings()

  const [localSettings, setLocalSettings] = useState(settings)

  if (!settingsPanelOpen) return null

  const handleSave = () => {
    setSettings(localSettings)
    settingsQuery.update.mutate(localSettings)
    setSettingsPanelOpen(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setSettingsPanelOpen(false)}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg-primary animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button
            onClick={() => setSettingsPanelOpen(false)}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="profile" className="text-xs">Profile</TabsTrigger>
            <TabsTrigger value="connected" className="text-xs">Connected</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="profile" className="p-4">
              <div className="space-y-6">
                {/* Profile */}
                <section>
                  <h3 className="mb-3 text-xs font-medium uppercase text-text-muted">
                    Profile
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-text-secondary">
                        Full Name
                      </label>
                      <Input
                        value={localSettings.full_name}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            full_name: e.target.value,
                          })
                        }
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-text-secondary">
                        Nickname
                      </label>
                      <Input
                        value={localSettings.nickname}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            nickname: e.target.value,
                          })
                        }
                        placeholder="What should I call you?"
                      />
                    </div>
                  </div>
                </section>

                {/* Custom Instructions */}
                <section>
                  <h3 className="mb-3 text-xs font-medium uppercase text-text-muted">
                    Custom Instructions
                  </h3>
                  <Textarea
                    value={localSettings.custom_instructions}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        custom_instructions: e.target.value,
                      })
                    }
                    placeholder="Add instructions that apply to all conversations..."
                    rows={4}
                  />
                </section>

                {/* Capabilities */}
                <section>
                  <h3 className="mb-3 text-xs font-medium uppercase text-text-muted">
                    Capabilities
                  </h3>
                  <div className="space-y-3">
                    <ToggleRow
                      label="Web Search"
                      description="Allow searching the web"
                      checked={localSettings.capabilities.web_search}
                      onChange={(v) =>
                        setLocalSettings({
                          ...localSettings,
                          capabilities: { ...localSettings.capabilities, web_search: v },
                        })
                      }
                    />
                    <ToggleRow
                      label="Artifacts"
                      description="Allow generating code and documents"
                      checked={localSettings.capabilities.artifacts}
                      onChange={(v) =>
                        setLocalSettings({
                          ...localSettings,
                          capabilities: { ...localSettings.capabilities, artifacts: v },
                        })
                      }
                    />
                    <ToggleRow
                      label="Code Execution"
                      description="Allow running code"
                      checked={localSettings.capabilities.code_execution}
                      onChange={(v) =>
                        setLocalSettings({
                          ...localSettings,
                          capabilities: {
                            ...localSettings.capabilities,
                            code_execution: v,
                          },
                        })
                      }
                    />
                    <ToggleRow
                      label="Memory"
                      description="Remember context across conversations"
                      checked={localSettings.capabilities.memory}
                      onChange={(v) =>
                        setLocalSettings({
                          ...localSettings,
                          capabilities: { ...localSettings.capabilities, memory: v },
                        })
                      }
                    />
                  </div>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="connected" className="p-4">
              <ConnectedTab />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          <Button onClick={handleSave} className="w-full">
            Save Settings
          </Button>
        </div>
      </div>
    </>
  )
}

function ConnectedTab() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  const providers = [
    { id: "openai", name: "OpenAI", placeholder: "sk-..." },
    { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
    { id: "google", name: "Google AI", placeholder: "AIza..." },
    { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
  ]

  const toggleShow = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const updateKey = (id: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [id]: value }))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Add your own API keys. These are stored locally and sent directly to the providers.
      </p>

      {providers.map((provider) => (
        <div key={provider.id} className="space-y-1.5">
          <label className="flex items-center justify-between text-xs text-text-secondary">
            {provider.name}
            {apiKeys[provider.id] && (
              <span className="flex items-center gap-1 text-success">
                <Check size={12} />
                Added
              </span>
            )}
          </label>
          <div className="relative">
            <Input
              type={showKeys[provider.id] ? "text" : "password"}
              value={apiKeys[provider.id] || ""}
              onChange={(e) => updateKey(provider.id, e.target.value)}
              placeholder={provider.placeholder}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => toggleShow(provider.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              {showKeys[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-bg-secondary px-4 py-3">
      <div>
        <div className="text-sm text-text-primary">{label}</div>
        <div className="text-xs text-text-muted">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-bg-tertiary"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  )
}
