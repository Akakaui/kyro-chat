"use client"

import { EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function IncognitoToggle() {
  const { incognito, toggleIncognito } = useChatStore()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleIncognito}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            incognito
              ? "bg-accent/15 text-accent"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          )}
        >
          <EyeOff size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {incognito
          ? "Incognito Mode ON — Transient chat (shareable via URL, not saved to history or memory)"
          : "Enable Incognito Mode (Transient, shareable chat without saving to history)"}
      </TooltipContent>
    </Tooltip>
  )
}
