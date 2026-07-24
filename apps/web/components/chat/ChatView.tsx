"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { Layers, Square, Wrench, Globe, Code2, BarChart2, Sparkles } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useCreateConversation, useMessages } from "@/lib/hooks"
import { sendMessageStream, type ToolUse } from "@/lib/api"
import { ChatMessage } from "./ChatMessage"
import { ChatInput, type AttachedFile } from "./ChatInput"
import { PermissionPrompt, type PermissionRequest } from "./PermissionPrompt"
import { QuestionForm } from "./QuestionForm"
import { TaskBadge, type TaskInfo } from "./TaskBadge"
import { BrowserOverlay } from "../browser/BrowserOverlay"
import { IncognitoToggle } from "./IncognitoToggle"

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
    agentStatus,
    setAgentStatus,
    panelOpen,
    setPanelOpen,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([])
  const createConversation = useCreateConversation()
  const messagesQuery = useMessages(activeConversation)

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

  const handleCancelTool = useCallback((taskId: string) => {
    useChatStore.getState().cancelSubtask(taskId)
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
      setAgentStatus("thinking")
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

            // Parse tool start marker
            const toolStartMarker = "__TOOL_START__:"
            const toolStartIdx = accumulated.indexOf(toolStartMarker)
            if (toolStartIdx !== -1) {
              try {
                const toolData = JSON.parse(accumulated.slice(toolStartIdx + toolStartMarker.length))
                // Map tool name to agent status
                const toolName = toolData.name?.toLowerCase() || ""
                let status: "idle" | "thinking" | "searching" | "browsing" | "writing_file" | "editing_file" | "running_command" | "sandbox_active" = "thinking"
                
                if (toolName.includes("web_search") || toolName.includes("search")) {
                  status = "searching"
                } else if (toolName.includes("browse") || toolName.includes("browser")) {
                  status = "browsing"
                } else if (toolName.includes("write_file") || toolName.includes("create_file") || toolName.includes("write")) {
                  status = "writing_file"
                } else if (toolName.includes("edit") || toolName.includes("patch")) {
                  status = "editing_file"
                } else if (toolName.includes("bash") || toolName.includes("terminal") || toolName.includes("exec")) {
                  status = "running_command"
                } else if (toolName.includes("sandbox")) {
                  status = "sandbox_active"
                }
                
                useChatStore.getState().setAgentStatus(status)
              } catch {}
              accumulated = accumulated.slice(0, toolStartIdx)
            }

            // Parse tool done marker
            const toolDoneMarker = "__TOOL_DONE__:"
            const toolDoneIdx = accumulated.indexOf(toolDoneMarker)
            if (toolDoneIdx !== -1) {
              try {
                const toolData = JSON.parse(accumulated.slice(toolDoneIdx + toolDoneMarker.length))
                // Update task status
                const existing = useChatStore.getState().tasks.find((task) => task.name === toolData.name)
                if (existing) {
                  useChatStore.getState().updateTask(existing.id, toolData.status || "done")
                }
                // Reset status to thinking after tool completes
                useChatStore.getState().setAgentStatus("thinking")
              } catch {}
              accumulated = accumulated.slice(0, toolDoneIdx)
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
          () => {
            setStreaming(false)
            setAgentStatus("idle")
          },
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
        setAgentStatus("idle")
      } finally {
        abortControllerRef.current = null
      }
    },
    [activeConversation, createConversation, addMessage, updateMessage, setStreaming, setAgentStatus, selectedModel]
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

            // Parse tool start marker
            const toolStartMarker = "__TOOL_START__:"
            const toolStartIdx = accumulated.indexOf(toolStartMarker)
            if (toolStartIdx !== -1) {
              try {
                const toolData = JSON.parse(accumulated.slice(toolStartIdx + toolStartMarker.length))
                // Map tool name to agent status
                const toolName = toolData.name?.toLowerCase() || ""
                let status: "idle" | "thinking" | "searching" | "browsing" | "writing_file" | "editing_file" | "running_command" | "sandbox_active" = "thinking"
                
                if (toolName.includes("web_search") || toolName.includes("search")) {
                  status = "searching"
                } else if (toolName.includes("browse") || toolName.includes("browser")) {
                  status = "browsing"
                } else if (toolName.includes("write_file") || toolName.includes("create_file") || toolName.includes("write")) {
                  status = "writing_file"
                } else if (toolName.includes("edit") || toolName.includes("patch")) {
                  status = "editing_file"
                } else if (toolName.includes("bash") || toolName.includes("terminal") || toolName.includes("exec")) {
                  status = "running_command"
                } else if (toolName.includes("sandbox")) {
                  status = "sandbox_active"
                }
                
                useChatStore.getState().setAgentStatus(status)
              } catch {}
              accumulated = accumulated.slice(0, toolStartIdx)
            }

            // Parse tool done marker
            const toolDoneMarker = "__TOOL_DONE__:"
            const toolDoneIdx = accumulated.indexOf(toolDoneMarker)
            if (toolDoneIdx !== -1) {
              try {
                const toolData = JSON.parse(accumulated.slice(toolDoneIdx + toolDoneMarker.length))
                // Update task status
                const existing = useChatStore.getState().tasks.find((task) => task.name === toolData.name)
                if (existing) {
                  useChatStore.getState().updateTask(existing.id, toolData.status || "done")
                }
                // Reset status to thinking after tool completes
                useChatStore.getState().setAgentStatus("thinking")
              } catch {}
              accumulated = accumulated.slice(0, toolDoneIdx)
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
          () => {
            setStreaming(false)
            setAgentStatus("idle")
          },
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
        setAgentStatus("idle")
      } finally {
        abortControllerRef.current = null
      }
    },
    [messages, activeConversation, setMessages, addMessage, updateMessage, setStreaming, setAgentStatus, selectedModel]
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
    <div className="flex h-full flex-col" style={{ background: "#121212" }}>
      {/* Top nav bar */}
      <div
        style={{
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid #1e1e1e",
          flexShrink: 0,
        }}
      >
        {/* Left: sidebar toggle + title */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              title="Open sidebar"
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "1px solid #22222a",
                color: "#9ca3af",
                cursor: "pointer",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = "#1e1e24"
                el.style.color = "#f3f4f6"
                el.style.borderColor = "#33333f"
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = "transparent"
                el.style.color = "#9ca3af"
                el.style.borderColor = "#22222a"
              }}
            >
              <Layers size={16} />
            </button>
          )}

          {/* Show "Kyro" brand only when sidebar is closed */}
          {!panelOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "7px",
                  background: "linear-gradient(135deg, #1a1400 0%, #2d1f00 100%)",
                  border: "1px solid rgba(217,119,6,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  K
                </span>
              </div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#ececec" }}>Kyro AI</span>
            </div>
          )}
        </div>

        {/* Right: incognito + model info */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <IncognitoToggle />
        </div>
      </div>

      {/* Messages area — bottom padding accounts for fixed input on mobile */}
      <div className="flex-1 overflow-y-auto pb-[140px] sm:pb-0">
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
                  onCancelTool={handleCancelTool}
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

      {/* Input with stop button overlay — fixed bottom on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 sm:relative sm:inset-x-auto sm:bottom-auto sm:z-auto">
        {isStreaming && (
          <button
            onClick={handleStopStreaming}
            className="absolute right-4 bottom-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-white shadow-lg transition-colors hover:bg-red-600 sm:right-4 sm:bottom-5"
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
  const agentStatus = useChatStore((s) => s.agentStatus)
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant")
  const toolUse = lastAssistantMsg?.tool_use

  // Map agent status to display text and icon
  const getStatusDisplay = () => {
    switch (agentStatus) {
      case "searching":
        return { text: "Searching the web...", icon: <Globe size={12} className="animate-pulse text-accent" /> }
      case "browsing":
        return { text: "Browsing website...", icon: <Globe size={12} className="animate-pulse text-accent" /> }
      case "writing_file":
        return { text: "Writing file...", icon: <Wrench size={12} className="animate-pulse text-accent" /> }
      case "editing_file":
        return { text: "Editing file...", icon: <Wrench size={12} className="animate-pulse text-accent" /> }
      case "running_command":
        return { text: "Running command...", icon: <Wrench size={12} className="animate-pulse text-accent" /> }
      case "sandbox_active":
        return { text: "Working in sandbox...", icon: <Wrench size={12} className="animate-pulse text-accent" /> }
      case "thinking":
      default:
        return { text: "Thinking...", icon: <span className="streaming-indicator flex gap-0.5"><span className="inline-block h-1 w-1 rounded-full bg-accent" /><span className="inline-block h-1 w-1 rounded-full bg-accent" /><span className="inline-block h-1 w-1 rounded-full bg-accent" /></span> }
    }
  }

  const { text, icon } = getStatusDisplay()

  // Show tool-specific status if available
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
      {icon}
      <span>{text}</span>
    </div>
  )
}

function EmptyState() {
  const suggestions = [
    {
      label: "Search the web",
      icon: <Globe size={16} />,
      prompt: "Search the web for the latest news on ",
    },
    {
      label: "Write code",
      icon: <Code2 size={16} />,
      prompt: "Write a function that ",
    },
    {
      label: "Analyze data",
      icon: <BarChart2 size={16} />,
      prompt: "Analyze this dataset and summarize the key trends: ",
    },
    {
      label: "Create artifact",
      icon: <Sparkles size={16} />,
      prompt: "Create an artifact that ",
    },
  ]

  const handleSuggestion = (prompt: string) => {
    window.dispatchEvent(new CustomEvent("kyro:prefill-input", { detail: { content: prompt } }))
  }

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-10 text-center sm:px-6">
      {/* Ambient background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-[min(90vw,600px)] -translate-x-1/2"
        style={{
          background: "radial-gradient(ellipse at center, rgba(217,119,6,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Logo / Avatar */}
      <div className="relative mb-6 flex items-center justify-center sm:mb-8">
        <div
          className="absolute h-[76px] w-[76px] rounded-full border sm:h-[88px] sm:w-[88px]"
          style={{ borderColor: "rgba(217,119,6,0.25)", animation: "spin 8s linear infinite" }}
        />
        <div
          className="flex h-16 w-16 items-center justify-center rounded-[18px] border sm:h-[72px] sm:w-[72px] sm:rounded-[20px]"
          style={{
            background: "linear-gradient(135deg, #1a1400 0%, #2d1f00 50%, #1a1400 100%)",
            borderColor: "rgba(217,119,6,0.3)",
            boxShadow: "0 0 40px rgba(217,119,6,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <span
            className="text-2xl font-extrabold sm:text-[28px]"
            style={{
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #92400e 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-1px",
            }}
          >
            K
          </span>
        </div>
      </div>

      {/* Heading */}
      <h1
        className="mb-3 text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl"
        style={{
          background: "linear-gradient(135deg, #ececec 0%, #a3a3a3 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        What can I help with today?
      </h1>

      <p className="mb-8 max-w-sm text-pretty text-sm leading-relaxed text-text-muted sm:mb-10 sm:text-base">
        Ask me anything — I can search the web, write and run code, analyze data, and create rich artifacts.
      </p>

      {/* Suggestion pills */}
      <div className="grid w-full max-w-md grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-center">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => handleSuggestion(s.prompt)}
            className="flex items-center justify-center gap-2 rounded-full border border-border bg-bg-secondary px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-accent/50 hover:bg-accent-muted hover:text-accent sm:justify-start sm:py-2"
          >
            <span className="shrink-0">{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

