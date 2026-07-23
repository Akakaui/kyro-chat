"use client"

import React from "react"
import { Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

export function ArtifactPill() {
  const { artifacts, setArtifactSheetOpen, artifactSheetOpen } = useChatStore()

  if (artifacts.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 sm:hidden"
      >
        <button
          onClick={() => setArtifactSheetOpen(!artifactSheetOpen)}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2.5",
            "backdrop-blur-xl border border-white/20",
            "shadow-lg shadow-black/30",
            "transition-all duration-200",
            artifactSheetOpen
              ? "bg-amber-500/20 border-amber-400/40"
              : "bg-white/10 hover:bg-white/15"
          )}
        >
          <Sparkles size={14} className="text-amber-400" />
          <span className="text-xs font-medium text-white/90">
            {artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""}
          </span>
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
