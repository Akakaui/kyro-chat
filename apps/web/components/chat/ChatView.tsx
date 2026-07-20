"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { Layers, Square, Wrench, Globe } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useCreateConversation, useMessages } from "@/lib/hooks"
import { sendMessageStream, type ToolUse } from "@/lib/api"
import { ChatMessage } from "./ChatMessage"
import { ChatInput, type AttachedFile } from "./ChatInput"
import { PermissionPrompt, type PermissionRequest } from "./PermissionPrompt"
import { QuestionForm } from "./QuestionForm"
import { TaskBadge, type TaskInfo } from "./TaskBadge"
import { BrowserOverlay } from "../browser/BrowserOverlay"

export function ChatView() {
  const {
    activeConversation,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    isStreaming,
    setStreaming,
    artifacts,
    setArtifactQueueOpen,
    selectedModel,
    pendingPermissions,
    addPendingPermission,
    removePendingPermission,
    pendingQuestions,
    addPendingQuestion,
    removePendingQuestion,
    tasks,
    addTask,
    updateTask,
    clearTasks,
    humanUsingBrowser,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([])
  const createConversation = useCreateConversation()
  const messagesQuery = useMessages(activeConversation)

  // Derive active tools from the last assistant message for task progress display
  const activeTools = React.useMemo(() => {
    if (!isStreaming) return []
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    if (!lastAssistant?.tool_use?.length) return []
    return lastAssistant.tool_use.map((t) => ({
      name: t.name,
      status: t.output ? ("done" as const) : ("running" as const),
    }))
  }, [messages, isStreaming])

  // Derive browser state for overlay
  const browserState = React.useMemo(() => {
    if (!isStreaming) return { active: false, url: "", status: "idle" as const }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
    const browserTool = lastAssistant?.tool_use?.find(
      (t) => t.name === "browse_web" || t.name === "browser"
    )
    if (!browserTool) return { active: false, url: "", status: "idle" as const }
    const url = (browserTool.input?.url as string) || (browserTool.input?.query as string) || ""
    return {
      active: true,
      url,
      status: browserTool.output ? ("active" as const) : ("loading" as const),
    }
  }, [messages, isStreaming])

  useEffect(() => {
    if (activeConversation && messagesQuery.data) {
      setMessages(messagesQuery.data)
    }
  }, [activeConversation, messagesQuery.data, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Listen for files added via AddToChatOverlay
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.files) {
        const newFiles: AttachedFile[] = detail.files.map((file: File) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        }))
        setAttachedFiles(prev => [...prev, ...newFiles])
      }
    }
    window.addEventListener("kyro:add-files", handler)
    return () => window.removeEventListener("kyro:add-files", handler)
  }, [])

  useEffect(() => {
    return () => {
      attachedFiles.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview)
      })
    }
  }, [])

  const handleStopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const handleSend = useCallback(
    async (content: string, files: AttachedFile[] = []) => {
      let convId = activeConversation

      if (!convId) {
        try {
          const conv = await createConversation.mutateAsync(content.slice(0, 50))
          convId = conv.id
          useChatStore.getState().setActiveConversation(conv.id)
        } catch {
          return
        }
      }

      const userMsg = {
        id: `temp-${Date.now()}`,
        role: "user" as const,
        content,
        timestamp: Date.now(),
      }
      addMessage(userMsg)
      setStreaming(true)
      clearTasks()

      const assistantMsgId = `temp-assistant-${Date.now()}`
      addMessage({
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      })

      const controller = new AbortController()
      abortControllerRef.current = controller

      let accumulated = ""
      let toolCalls: ToolUse[] = []
      try {
        await sendMessageStream(
          convId,
          content,
          (chunk) => {
            accumulated += chunk

            // Parse sandbox ID marker
            const sandboxMarker = "__SANDBOX_ID__:"
            const sandboxIdx = accumulated.indexOf(sandboxMarker)
            if (sandboxIdx !== -1) {
              try {
                const sandboxId = accumulated.slice(sandboxIdx + sandboxMarker.length).trim()
                useChatStore.getState().setSandboxId(sandboxId)
              } catch {}
              accumulated = accumulated.slice(0, sandboxIdx)
            }

            // Parse artifacts marker
            const artifactMarker = "__ARTIFACTS__:"
            const artifactIdx = accumulated.indexOf(artifactMarker)
            if (artifactIdx !== -1) {
              try {
                const artifacts = JSON.parse(accumulated.slice(artifactIdx + artifactMarker.length))
                artifacts.forEach((a: any) => {
                  useChatStore.getState().addArtifact({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    size: a.size,
                    content: "",
                    created_at: Date.now(),
                  })
                })
              } catch {}
              accumulated = accumulated.slice(0, artifactIdx)
            }

            // Parse tool usage marker
            const toolMarker = "__TOOLS_USED__:"
            const toolIdx = accumulated.indexOf(toolMarker)
            if (toolIdx !== -1) {
              try {
                toolCalls = JSON.parse(accumulated.slice(toolIdx + toolMarker.length))
                // Update tasks from tool usage
                toolCalls.forEach((t: ToolUse) => {
                  const existing = useChatStore.getState().tasks.find((task) => task.id === t.id)
                  if (existing) {
                    updateTask(t.id, t.output ? "done" : "running")
                  } else {
                    addTask({
                      id: t.id,
                      name: t.name,
                      status: t.output ? "done" : "running",
                    })
                  }
                })
              } catch {}
              const displayContent = accumulated.slice(0, toolIdx)
              updateMessage(assistantMsgId, { content: displayContent, tool_use: toolCalls })
            } else {
              updateMessage(assistantMsgId, { content: accumulated })
            }

            // Parse permission required marker
            const permMarker = "__PERMISSION_REQUIRED__:"
            const permIdx = accumulated.indexOf(permMarker)
            if (permIdx !== -1) {
              try {
                const permData = JSON.parse(accumulated.slice(permIdx + permMarker.length))
                addPendingPermission({
                  id: permData.id,
                  toolName: permData.toolName,
                  description: permData.description || "",
                  args: permData.args,
                  source: permData.source,
                })
              } catch {}
              accumulated = accumulated.slice(0, permIdx)
            }

            // Parse question required marker
            const qMarker = "__QUESTION_REQUIRED__:"
            const qIdx = accumulated.indexOf(qMarker)
            if (qIdx !== -1) {
              try {
                const qData = JSON.parse(accumulated.slice(qIdx + qMarker.length))
                addPendingQuestion({
                  id: qData.id,
                  question: qData.question,
                  type: qData.type,
                  options: qData.options,
                  required: qData.required !== false,
                })
              } catch {}
              accumulated = accumulated.slice(0, qIdx)
            }
          },
          () => setStreaming(false),
          (errorMsg) => {
            updateMessage(assistantMsgId, { content: accumulated || "" })
            if (!accumulated) {
              updateMessage(assistantMsgId, { content: `Error: ${errorMsg}` })
            }
          },
          selectedModel.id,
          undefined,
          undefined,
          controller.signal,
          useChatStore.getState().chatMode,
          useChatStore.getState().incognito,
        )
      } catch {
        if (controller.signal.aborted) {
          updateMessage(assistantMsgId, { content: accumulated || "" })
        } else {
          updateMessage(assistantMsgId, { content: "Sorry, something went wrong. Please try again." })
        }
        setStreaming(false)
      } finally {
        abortControllerRef.current = null
      }
    },
    [activeConversation, createConversation, addMessage, updateMessage, setStreaming, selectedModel]
  )

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx < 0) return
      const assistantMsg = messages[idx]
      if (assistantMsg.role !== "assistant") return

      const userMsgIdx = idx - 1
      if (userMsgIdx < 0) return
      const userMsg = messages[userMsgIdx]
      if (userMsg.role !== "user") return

      setMessages(messages.slice(0, idx))

      setStreaming(true)
      const assistantMsgId = `temp-regen-${Date.now()}`
      addMessage({ id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now() })
      clearTasks()

      const controller = new AbortController()
      abortControllerRef.current = controller

      let accumulated = ""
      let regenToolCalls: ToolUse[] = []
      try {
        await sendMessageStream(
          activeConversation!,
          userMsg.content,
          (chunk) => {
            accumulated += chunk

            // Parse sandbox ID marker
            const sandboxMarker = "__SANDBOX_ID__:"
            const sandboxIdx = accumulated.indexOf(sandboxMarker)
            if (sandboxIdx !== -1) {
              try {
                const sandboxId = accumulated.slice(sandboxIdx + sandboxMarker.length).trim()
                useChatStore.getState().setSandboxId(sandboxId)
              } catch {}
              accumulated = accumulated.slice(0, sandboxIdx)
            }

            // Parse artifacts marker
            const artifactMarker = "__ARTIFACTS__:"
            const artifactIdx = accumulated.indexOf(artifactMarker)
            if (artifactIdx !== -1) {
              try {
                const artifacts = JSON.parse(accumulated.slice(artifactIdx + artifactMarker.length))
                artifacts.forEach((a: any) => {
                  useChatStore.getState().addArtifact({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    size: a.size,
                    content: "",
                    created_at: Date.now(),
                  })
                })
              } catch {}
              accumulated = accumulated.slice(0, artifactIdx)
            }

            // Parse tool usage marker
            const toolMarker = "__TOOLS_USED__:"
            const toolIdx = accumulated.indexOf(toolMarker)
            if (toolIdx !== -1) {
              try { regenToolCalls = JSON.parse(accumulated.slice(toolIdx + toolMarker.length)) } catch {}
              const displayContent = accumulated.slice(0, toolIdx)
              updateMessage(assistantMsgId, { content: displayContent, tool_use: regenToolCalls })
            } else {
              updateMessage(assistantMsgId, { content: accumulated })
            }

            // Parse permission required marker
            const permMarker = "__PERMISSION_REQUIRED__:"
            const permIdx = accumulated.indexOf(permMarker)
            if (permIdx !== -1) {
              try {
                const permData = JSON.parse(accumulated.slice(permIdx + permMarker.length))
                addPendingPermission({
                  id: permData.id,
                  toolName: permData.toolName,
                  description: permData.description || "",
                  args: permData.args,
                  source: permData.source,
                })
              } catch {}
              accumulated = accumulated.slice(0, permIdx)
            }

            // Parse question required marker
            const qMarker = "__QUESTION_REQUIRED__:"
            const qIdx = accumulated.indexOf(qMarker)
            if (qIdx !== -1) {
              try {
                const qData = JSON.parse(accumulated.slice(qIdx + qMarker.length))
                addPendingQuestion({
                  id: qData.id,
                  question: qData.question,
                  type: qData.type,
                  options: qData.options,
                  required: qData.required !== false,
                })
              } catch {}
              accumulated = accumulated.slice(0, qIdx)
            }
          },
          () => setStreaming(false),
          (errorMsg) => {
            updateMessage(assistantMsgId, { content: accumulated || "" })
            if (!accumulated) {
              updateMessage(assistantMsgId, { content: `Error: ${errorMsg}` })
            }
          },
          selectedModel.id,
          undefined,
          undefined,
          controller.signal,
          useChatStore.getState().chatMode,
          useChatStore.getState().incognito,
        )
      } catch {
        if (controller.signal.aborted) {
          updateMessage(assistantMsgId, { content: accumulated || "" })
        } else {
          updateMessage(assistantMsgId, { content: "Sorry, something went wrong. Please try again." })
        }
        setStreaming(false)
      } finally {
        abortControllerRef.current = null
      }
    },
    [messages, activeConversation, setMessages, addMessage, updateMessage, setStreaming, selectedModel]
  )

  const handleUndo = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx < 0) return
      setMessages(messages.slice(0, idx))
    },
    [messages, setMessages]
  )

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.content) handleSend(detail.content, detail.files || [])
    }
    window.addEventListener("kyro:send-message", handler)
    return () => window.removeEventListener("kyro:send-message", handler)
  }, [handleSend])

  const handlePermissionDecision = useCallback(
    async (id: string, decision: "allow" | "deny", remember: boolean) => {
      removePendingPermission(id)
      try {
        const token = localStorage.getItem("token")
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/chat/permission-response`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ permissionId: id, decision, remember }),
          }
        )
      } catch {
        // Permission response failed silently
      }
    },
    [removePendingPermission]
  )

  const handleQuestionAnswer = useCallback(
    async (questionId: string, answer: string | string[]) => {
      removePendingQuestion(questionId)
      try {
        const token = localStorage.getItem("token")
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/chat/question-response`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ questionId, answer }),
          }
        )
      } catch {
        // Question response failed silently
      }
    },
    [removePendingQuestion]
  )

  const hasMessages = messages.length > 0

  // Derive task info for TaskBadge
  const taskInfo: TaskInfo[] = React.useMemo(() => {
    return tasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
    }))
  }, [tasks])

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {!hasMessages ? (
            <EmptyState />
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isLast={i === messages.length - 1}
                  onRegenerate={handleRegenerate}
                  onUndo={handleUndo}
                />
              ))}
              {isStreaming && <StreamingIndicator messages={messages} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Permission prompts — inline above input */}
      {pendingPermissions.length > 0 && (
        <div className="border-t border-border bg-bg-primary px-3 py-2 md:px-4">
          <div className="mx-auto max-w-3xl space-y-2">
            {pendingPermissions.map((perm) => (
              <PermissionPrompt
                key={perm.id}
                request={perm}
                onDecision={handlePermissionDecision}
                compact={pendingPermissions.length > 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* HITL Question prompts — inline above input */}
      {pendingQuestions.length > 0 && (
        <div className="border-t border-border bg-bg-primary px-3 py-2 md:px-4">
          <div className="mx-auto max-w-3xl space-y-2">
            {pendingQuestions.map((q) => (
              <QuestionForm
                key={q.id}
                questionId={q.id}
                question={q.question}
                type={q.type}
                options={q.options}
                required={q.required}
                onAnswer={handleQuestionAnswer}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input with stop button overlay */}
      <div className="relative">
        {isStreaming && (
          <button
            onClick={handleStopStreaming}
            className="absolute right-4 bottom-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white shadow-lg transition-colors hover:bg-red-600"
            title="Stop generating"
          >
            <Square size={14} fill="currentColor" />
          </button>
        )}
        <ChatInput
          onFilesSelect={setAttachedFiles}
          attachedFiles={attachedFiles}
          onRemoveFile={(index) =>
            setAttachedFiles((prev) => {
              const removed = prev[index]
              if (removed?.preview) URL.revokeObjectURL(removed.preview)
              return prev.filter((_, i) => i !== index)
            })
          }
          activeTools={activeTools}
          taskBadge={taskInfo.length > 0 ? <TaskBadge tasks={taskInfo} /> : undefined}
        />
      </div>

      {/* Browser overlay — appears when browser tool is active */}
      <BrowserOverlay
        isOpen={browserState.active}
        onClose={() => {}}
        url={browserState.url}
        status={browserState.status}
      />
    </div>
  )
}

function StreamingIndicator({ messages }: { messages: any[] }) {
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant")
  const toolUse = lastAssistantMsg?.tool_use

  if (toolUse && toolUse.length > 0) {
    const lastTool = toolUse[toolUse.length - 1]
    return (
      <div className="flex items-center gap-2 px-4 text-xs text-text-muted md:px-0">
        <Wrench size={12} className="animate-pulse text-accent" />
        <span>
          Using <span className="font-medium text-text-secondary">{lastTool.name}</span>...
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 text-xs text-text-muted md:px-0">
      <span className="streaming-indicator flex gap-0.5">
        <span className="inline-block h-1 w-1 rounded-full bg-accent" />
        <span className="inline-block h-1 w-1 rounded-full bg-accent" />
        <span className="inline-block h-1 w-1 rounded-full bg-accent" />
      </span>
      Thinking...
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        What can I help with?
      </h2>
      <p className="max-w-sm text-sm text-text-secondary">
        Ask me anything. I can search the web, write code, analyze data, and create artifacts.
      </p>
      <div className="mt-6 flex gap-2">
        {["Search the web", "Write code", "Analyze data"].map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
