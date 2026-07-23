"use client"

import { useState } from "react"
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat"

interface MessageActionsProps {
  messageId: string
  isUser: boolean
  isLast: boolean
  content: string
  onRegenerate?: (messageId: string) => void
}

export function MessageActions({
  messageId,
  isUser,
  isLast,
  content,
  onRegenerate,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

  const liked = useChatStore((s) => !!s.likedMessages[messageId])
  const disliked = useChatStore((s) => !!s.dislikedMessages[messageId])
  const toggleLike = useChatStore((s) => s.toggleLike)
  const toggleDislike = useChatStore((s) => s.toggleDislike)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail in some contexts
    }
  }

  return (
    <div
      className={cn(
        "absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-border/50 bg-bg-tertiary/80 px-1 py-0.5 backdrop-blur-sm",
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      )}
    >
      {/* Copy */}
      <ActionBtn
        onClick={handleCopy}
        tooltip={copied ? "Copied" : "Copy"}
        active={false}
      >
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </ActionBtn>

      {/* Like */}
      <ActionBtn
        onClick={() => toggleLike(messageId)}
        tooltip="Like"
        active={liked}
      >
        <ThumbsUp
          size={14}
          className={cn(liked && "fill-accent text-accent")}
        />
      </ActionBtn>

      {/* Dislike */}
      <ActionBtn
        onClick={() => toggleDislike(messageId)}
        tooltip="Dislike"
        active={disliked}
      >
        <ThumbsDown
          size={14}
          className={cn(disliked && "fill-accent text-accent")}
        />
      </ActionBtn>

      {/* Regenerate — assistant messages only */}
      {!isUser && (
        <ActionBtn
          onClick={() => onRegenerate?.(messageId)}
          tooltip="Regenerate"
          active={false}
        >
          <RotateCw size={14} />
        </ActionBtn>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tiny icon button                                                    */
/* ------------------------------------------------------------------ */
function ActionBtn({
  onClick,
  tooltip,
  active,
  children,
}: {
  onClick: () => void
  tooltip: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        active
          ? "text-accent"
          : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
      )}
    >
      {children}
    </button>
  )
}
