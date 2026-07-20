"use client"

import { useChatStore } from "@/stores/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function ProfilePage() {
  const { settings, setSettings } = useChatStore()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Profile</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your personal information.
        </p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-accent text-xl font-bold text-white">
          {(settings.full_name || "U").charAt(0).toUpperCase()}
        </div>
        <Button variant="outline" size="sm">
          Change avatar
        </Button>
      </div>

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          Full Name
        </label>
        <Input
          value={settings.full_name}
          onChange={(e) =>
            setSettings({ ...settings, full_name: e.target.value })
          }
          placeholder="Your name"
        />
      </div>

      {/* Nickname */}
      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          Nickname
        </label>
        <Input
          value={settings.nickname}
          onChange={(e) =>
            setSettings({ ...settings, nickname: e.target.value })
          }
          placeholder="What should I call you?"
        />
      </div>

      {/* Custom instructions */}
      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          Custom Instructions
        </label>
        <Textarea
          value={settings.custom_instructions}
          onChange={(e) =>
            setSettings({ ...settings, custom_instructions: e.target.value })
          }
          placeholder="Add instructions that apply to all conversations..."
          rows={4}
        />
      </div>

      <Button className="w-full sm:w-auto">Save Changes</Button>
    </div>
  )
}
