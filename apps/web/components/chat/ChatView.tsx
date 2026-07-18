"use client"

import { useEffect, useRef, useCallback } from "react"
import { ArrowLeft, PanelLeft, Layers, AlertCircle } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useCreateConversation, useMessages } from "@/lib/hooks"
import { sendMessageStream } from "@/lib/api"
import { ChatMessage } from "./ChatMessage"
import { ChatInput } from "./ChatInput"

export function ChatView() {
  const {
    activeConversation,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    isStreaming,
    setStreaming,
    togglePanel,
    artifacts,
    setArtifactQueueOpen,
    selectedModel,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const createConversation = useCreateConversation()
  const messagesQuery = useMessages(activeConversation)

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConversation && messagesQuery.data) {
      setMessages(messagesQuery.data)
    }
  }, [activeConversation, messagesQuery.data, setMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle send message
  const handleSend = useCallback(
    async (content: string) => {
      let convId = activeConversation

      // Create conversation if none active
      if (!convId) {
        try {
          const conv = await createConversation.mutateAsync(
            content.slice(0, 50)
          )
          convId = conv.id
          useChatStore.getState().setActiveConversation(conv.id)
        } catch {
          return
        }
      }

      // Add user message
      const userMsg = {
        id: `temp-${Date.now()}`,
        role: "user" as const,
        content,
        timestamp: Date.now(),
      }
      addMessage(userMsg)
      setStreaming(true)

      // Create placeholder for assistant response
      const assistantMsgId = `temp-assistant-${Date.now()}`
      addMessage({
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      })

      // Stream response
      let accumulated = ""
      try {
        await sendMessageStream(
          convId,
          content,
          (chunk) => {
            accumulated += chunk
            updateMessage(assistantMsgId, { content: accumulated })
          },
          () => {
            setStreaming(false)
          },
          (errorMsg) => {
            updateMessage(assistantMsgId, {
              content: accumulated || "",
            })
            if (!accumulated) {
              updateMessage(assistantMsgId, {
                content: `⚠️ ${errorMsg}`,
              })
            }
          },
          selectedModel.id,
        )
      } catch {
        updateMessage(assistantMsgId, {
          content: "Sorry, something went wrong. Please try again.",
        })
        setStreaming(false)
      }
    },
    [
      activeConversation,
      createConversation,
      addMessage,
      updateMessage,
      setStreaming,
      selectedModel,
    ]
  )

  // Listen for send events from ChatInput
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.content) handleSend(detail.content)
    }
    window.addEventListener("kyro:send-message", handler)
    return () => window.removeEventListener("kyro:send-message", handler)
  }, [handleSend])

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 md:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePanel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <PanelLeft size={18} />
          </button>
          {activeConversation && (
            <button
              onClick={() => {
                useChatStore.getState().setActiveConversation(null)
                setMessages([])
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary md:hidden"
            >
              <ArrowLeft size={18} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {artifacts.length > 0 && (
            <button
              onClick={() => setArtifactQueueOpen(true)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Layers size={18} />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                {artifacts.length}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {!hasMessages ? (
            <EmptyState />
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isStreaming && (
                <div className="flex items-center gap-2 px-4 text-xs text-text-muted md:px-0">
                  <span className="streaming-indicator flex gap-0.5">
                    <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                    <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                    <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                  </span>
                  Thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {/* Kyro logo / icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
        <span className="text-2xl font-bold text-accent">K</span>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        What can I help with?
      </h2>
      <p className="max-w-sm text-sm text-text-secondary">
        Ask me anything. I can search the web, write code, analyze data, and
        create artifacts.
      </p>
    </div>
  )
}
