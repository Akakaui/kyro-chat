"use client"

import React, { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Camera,
  Image,
  FileText,
  Globe,
  X,
  EyeOff,
  Wrench,
  FolderPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

export function AddToChatOverlay() {
  const {
    addToChatOverlayOpen,
    setAddToChatOverlayOpen,
    settings,
    setSettings,
  } = useChatStore()
  const [toolAccess, setToolAccess] = useState(true)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCamera = () => cameraInputRef.current?.click()
  const handlePhoto = () => photoInputRef.current?.click()
  const handleFile = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    window.dispatchEvent(
      new CustomEvent("kyro:add-files", {
        detail: { files: Array.from(files) },
      })
    )
    setAddToChatOverlayOpen(false)
    e.target.value = ""
  }

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx,.pptx,.zip,.py,.js,.ts,.tsx,.jsx,.html,.css,.yaml,.yml,.toml"
        onChange={handleFileChange}
        className="hidden"
      />

      <AnimatePresence>
        {addToChatOverlayOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={() => setAddToChatOverlayOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-bg-secondary pb-safe"
            >
              {/* Handle */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h3 className="text-base font-semibold text-text-primary">
                  Add to chat
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      useChatStore.getState().toggleIncognito()
                    }
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      useChatStore.getState().incognito
                        ? "bg-accent/15 text-accent"
                        : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
                    )}
                    title={
                      useChatStore.getState().incognito
                        ? "Incognito on"
                        : "Turn on incognito"
                    }
                  >
                    <EyeOff size={18} />
                  </button>
                  <button
                    onClick={() => setAddToChatOverlayOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Action buttons row */}
              <div className="flex justify-center gap-6 px-5 py-4">
                <ActionButton
                  icon={<Camera size={22} />}
                  label="Camera"
                  onClick={handleCamera}
                />
                <ActionButton
                  icon={<Image size={22} />}
                  label="Photos"
                  onClick={handlePhoto}
                />
                <ActionButton
                  icon={<FileText size={22} />}
                  label="Files"
                  onClick={handleFile}
                />
              </div>

              {/* Divider */}
              <div className="mx-5 h-px bg-border" />

              {/* Options */}
              <div className="px-5 py-3 space-y-1">
                <OptionRow
                  icon={<Globe size={18} />}
                  label="Web search"
                  toggle
                  enabled={settings.capabilities.web_search}
                  onToggle={() =>
                    setSettings({
                      ...settings,
                      capabilities: {
                        ...settings.capabilities,
                        web_search: !settings.capabilities.web_search,
                      },
                    })
                  }
                />
                <OptionRow
                  icon={<Wrench size={18} />}
                  label="Tool access"
                  toggle
                  enabled={toolAccess}
                  onToggle={() => setToolAccess(!toolAccess)}
                />
                <OptionRow
                  icon={<FolderPlus size={18} />}
                  label="Add to project"
                  onClick={() => setAddToChatOverlayOpen(false)}
                />
              </div>

              <div className="h-2" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl px-3 py-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary transition-colors">
        {icon}
      </div>
      <span className="text-xs">{label}</span>
    </button>
  )
}

function OptionRow({
  icon,
  label,
  toggle,
  enabled,
  onToggle,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  toggle?: boolean
  enabled?: boolean
  onToggle?: () => void
  onClick?: () => void
}) {
  return (
    <button
      onClick={toggle ? onToggle : onClick}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-hover"
    >
      <div className="flex items-center gap-3">
        <span className="text-text-secondary">{icon}</span>
        <span className="text-sm text-text-primary">{label}</span>
      </div>
      {toggle && (
        <div
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            enabled ? "bg-accent" : "bg-bg-tertiary"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
              enabled ? "left-[18px]" : "left-0.5"
            )}
          />
        </div>
      )}
    </button>
  )
}
