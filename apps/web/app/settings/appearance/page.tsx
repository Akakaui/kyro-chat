"use client"

import { Moon, Sun } from "lucide-react"
import { useChatStore } from "@/stores/chat"

const ACCENT_COLORS = [
  { name: "Blue", value: "#2563EB" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Green", value: "#22C55E" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
  { name: "Red", value: "#EF4444" },
]

export default function AppearancePage() {
  const { settings, setAppearance } = useChatStore()

  const update = (patch: Partial<typeof settings.appearance>) => {
    setAppearance({ ...settings.appearance, ...patch })
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Appearance</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Customize the look and feel of the app.
        </p>
      </div>

      {/* Theme */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase text-text-muted">
          Theme
        </h2>
        <div className="flex gap-3">
          {[
            { key: "dark" as const, label: "Dark", icon: Moon },
            { key: "light" as const, label: "Light", icon: Sun },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => update({ theme: key })}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm transition-colors ${
                settings.appearance.theme === key
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Accent color */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase text-text-muted">
          Accent Color
        </h2>
        <div className="flex items-center gap-3">
          {ACCENT_COLORS.map((c) => {
            const active = settings.appearance.accent === c.value
            return (
              <button
                key={c.value}
                title={c.name}
                onClick={() => update({ accent: c.value })}
                className={`h-8 w-8 rounded-full transition-all ${
                  active ? "scale-110" : "hover:scale-110"
                }`}
                style={{
                  backgroundColor: c.value,
                  boxShadow: active
                    ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c.value}`
                    : undefined,
                }}
              />
            )
          })}
        </div>
      </section>

      {/* Font size */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase text-text-muted">
          Font Size
        </h2>
        <div className="flex gap-3">
          {[
            { key: "sm" as const, label: "Small" },
            { key: "md" as const, label: "Default" },
            { key: "lg" as const, label: "Large" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => update({ fontSize: opt.key })}
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
      </section>
    </div>
  )
}
