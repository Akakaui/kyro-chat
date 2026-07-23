"use client"

import { useState, useCallback, type ReactNode } from "react"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  HelpCircle,
  Shield,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import type { Message, ToolUse } from "@/lib/api"
import { useChatStore, type PermissionLevel } from "@/stores/chat"
import { MessageActions } from "./MessageActions"
import { ToolIndicator } from "./ToolIndicator"
import { QuestionForm } from "./QuestionForm"
import { BrowserEmbed } from "./BrowserEmbed"
import { ImageMessage } from "./ImageMessage"

interface ChatMessageProps {
  message: Message
  isLast?: boolean
  onRegenerate?: (messageId: string) => void
  onCancelTool?: (taskId: string) => void
}

export function ChatMessage({
  message,
  isLast = false,
  onRegenerate,
  onCancelTool,
}: ChatMessageProps) {
  const isUser = message.role === "user"
  const { setActiveArtifact, setArtifactViewerOpen, selectedModel, selectedAgent } = useChatStore()

  // Mock permission state: tracks decisions for tool call IDs
  const [permissionDecisions, setPermissionDecisions] = useState<
    Record<string, PermissionLevel>
  >({})
  const [allowAllSession, setAllowAllSession] = useState(false)
  const [questionAnswers, setQuestionAnswers] = useState<
    Record<string, string | string[]>
  >({})

  const handlePermissionDecision = useCallback(
    (toolId: string, decision: PermissionLevel) => {
      setPermissionDecisions((prev) => ({ ...prev, [toolId]: decision }))
      if (decision === "allow") {
        setAllowAllSession(true)
      }
    },
    []
  )

  const handleQuestionAnswer = useCallback(
    (questionId: string, answer: string | string[]) => {
      setQuestionAnswers((prev) => ({ ...prev, [questionId]: answer }))
    },
    []
  )

  // Mock: find the first tool call that still needs a decision
  const pendingToolCall =
    !isUser && message.tool_use?.length
      ? message.tool_use.find(
          (t: ToolUse) => !permissionDecisions[t.id] && !allowAllSession
        )
      : undefined

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-2 md:px-0",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] md:max-w-[70%]",
          isUser ? "order-1 ml-auto" : "order-2"
        )}
      >
        {/* Model + Agent name label — assistant messages only */}
        {!isUser && (
          <div className="mb-1 text-[11px] font-medium text-zinc-500">
            {selectedModel?.name || "assistant"}
            {selectedAgent?.name && (
              <span className="text-zinc-600"> / {selectedAgent.name}</span>
            )}
          </div>
        )}
        {/* Message bubble */}
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3",
            isUser
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-primary"
          )}
        >
          {/* Floating action toolbar */}
          <MessageActions
            messageId={message.id}
            isUser={isUser}
            isLast={isLast}
            content={message.content}
            onRegenerate={onRegenerate}
          />

          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "")
                    const isBlock = String(children).includes("\n")

                    if (isBlock) {
                      return (
                        <CodeBlock
                          language={match?.[1] || "text"}
                          value={String(children).replace(/\n$/, "")}
                        />
                      )
                    }
                    return (
                      <code
                        className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-accent"
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  p({ children }) {
                    return (
                      <p className="mb-3 text-sm leading-relaxed last:mb-0">
                        {children}
                      </p>
                    )
                  },
                  ul({ children }) {
                    return (
                      <ul className="mb-3 list-disc pl-4 text-sm leading-relaxed">
                        {children}
                      </ul>
                    )
                  },
                  ol({ children }) {
                    return (
                      <ol className="mb-3 list-decimal pl-4 text-sm leading-relaxed">
                        {children}
                      </ol>
                    )
                  },
                  li({ children }) {
                    return <li className="mb-1">{children}</li>
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {children}
                      </a>
                    )
                  },
                  h1({ children }) {
                    return (
                      <h1 className="mb-3 text-lg font-semibold">{children}</h1>
                    )
                  },
                  h2({ children }) {
                    return (
                      <h2 className="mb-2 text-base font-semibold">
                        {children}
                      </h2>
                    )
                  },
                  h3({ children }) {
                    return (
                      <h3 className="mb-2 text-sm font-semibold">{children}</h3>
                    )
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="mb-3 border-l-2 border-accent pl-4 text-text-secondary italic">
                        {children}
                      </blockquote>
                    )
                  },
                  table({ children }) {
                    return (
                      <div className="mb-3 overflow-x-auto">
                        <table className="w-full text-sm">{children}</table>
                      </div>
                    )
                  },
                  th({ children }) {
                    return (
                      <th className="border-b border-border px-3 py-2 text-left font-medium">
                        {children}
                      </th>
                    )
                  },
                  td({ children }) {
                    return (
                      <td className="border-b border-border px-3 py-2">
                        {children}
                      </td>
                    )
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tool indicators — shown below assistant message bubbles */}
        {!isUser && message.tool_use && message.tool_use.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.tool_use.map((tool) => (
              <ToolIndicator
                key={tool.id}
                toolName={tool.name}
                source="builtin"
                isLoading={!tool.output}
                details={tool.output ? tool.output.slice(0, 200) : undefined}
                onCancel={onCancelTool ? () => onCancelTool(tool.id) : undefined}
              />
            ))}
          </div>
        )}

        {/* Browser embed — rendered for browser_session tool calls */}
        {!isUser &&
          message.tool_use &&
          message.tool_use
            .filter((t) => t.name === "browser_session")
            .map((tool) => {
              const params = tool.input as { task_id?: string }
              const taskId = params.task_id || tool.id
              return (
                <BrowserEmbed
                  key={`browser-${tool.id}`}
                  taskId={taskId}
                  className="mt-2"
                />
              )
            })}

        {/* Image generation — rendered for image_gen tool calls */}
        {!isUser &&
          message.tool_use &&
          message.tool_use
            .filter((t) => t.name === "image_gen" && t.output)
            .map((tool) => {
              const output = tool.output as { image_url?: string }
              if (!output.image_url) return null
              const input = tool.input as { prompt?: string }
              return (
                <ImageMessage
                  key={`image-${tool.id}`}
                  url={output.image_url}
                  prompt={input.prompt}
                  className="mt-2 max-w-sm"
                />
              )
            })}

        {/* Question forms — rendered inline for ask_question tool calls */}
        {!isUser &&
          message.tool_use &&
          message.tool_use
            .filter((t) => t.name === "ask_question" && !questionAnswers[t.id])
            .map((tool) => {
              const params = tool.input as {
                question: string
                type: "single_choice" | "multiple_choice" | "free_text"
                options?: Array<{ label: string; value: string }>
                required?: boolean
              }
              return (
                <QuestionForm
                  key={tool.id}
                  questionId={tool.id}
                  question={params.question}
                  type={params.type}
                  options={params.options}
                  required={params.required}
                  onAnswer={handleQuestionAnswer}
                  disabled={false}
                />
              )
            })}

        {/* Answered questions — show user's response */}
        {!isUser &&
          message.tool_use &&
          message.tool_use
            .filter((t) => t.name === "ask_question" && questionAnswers[t.id])
            .map((tool) => {
              const answer = questionAnswers[tool.id]
              const answerText = Array.isArray(answer)
                ? answer.join(", ")
                : answer
              return (
                <div
                  key={`answer-${tool.id}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[11px] text-accent"
                >
                  <span className="font-medium">Answer:</span>
                  <span>{answerText}</span>
                </div>
              )
            })}

        {/* Permission request — inline below tool indicators */}
        {pendingToolCall && (
          <PermissionRequest
            toolCall={pendingToolCall}
            decision={permissionDecisions[pendingToolCall.id]}
            onDecision={handlePermissionDecision}
            allowAllSession={allowAllSession}
            onAllowAllSession={() => setAllowAllSession(true)}
          />
        )}

        {/* Resolved permission badges for already-decided tools (non-pending) */}
        {!isUser &&
          message.tool_use &&
          message.tool_use.length > 0 &&
          Object.entries(permissionDecisions).map(([toolId, decision]) => {
            if (toolId === pendingToolCall?.id) return null
            const tool = message.tool_use!.find((t) => t.id === toolId)
            if (!tool) return null
            return (
              <PermissionBadge
                key={toolId}
                toolName={tool.name}
                decision={decision}
              />
            )
          })}

        {/* Inline artifact cards */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.artifacts.map((artifact) => (
              <button
                key={artifact.id}
                onClick={() => {
                  setActiveArtifact(artifact)
                  setArtifactViewerOpen(true)
                }}
                className="flex items-center gap-2 rounded-xl border border-border bg-bg-secondary/50 px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
              >
                <span className="font-medium">{artifact.title}</span>
                <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] uppercase">
                  {artifact.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Code block component with copy and language display
function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-bg-tertiary px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-bg-primary p-4">
        <code className="font-mono text-xs leading-relaxed text-text-primary">
          {value}
        </code>
      </pre>
    </div>
  )
}

// ---------- Inline permission components ----------

interface PermissionRequestProps {
  toolCall: ToolUse
  decision?: PermissionLevel
  onDecision: (toolId: string, decision: PermissionLevel) => void
  allowAllSession: boolean
  onAllowAllSession: () => void
}

function PermissionRequest({
  toolCall,
  decision,
  onDecision,
  allowAllSession,
  onAllowAllSession,
}: PermissionRequestProps) {
  // Mock description based on tool name
  const description = getToolDescription(toolCall.name, toolCall.input)

  if (decision && !allowAllSession) {
    // Already decided — show resolved badge inline
    return (
      <PermissionBadge toolName={toolCall.name} decision={decision} />
    )
  }

  if (allowAllSession) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-400">
        <CheckCircle size={12} />
        <span className="font-medium">All tools allowed for this session</span>
      </div>
    )
  }

  return (
    <div className="mt-2 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-bg-secondary/80">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Shield size={13} className="text-accent shrink-0" />
        <span className="text-xs font-medium text-text-primary">
          {toolCall.name}
        </span>
      </div>

      {/* Description */}
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-[11px] leading-relaxed text-text-secondary">
          {description}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button
          onClick={() => onDecision(toolCall.id, "allow")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
        >
          <CheckCircle size={12} />
          Allow
        </button>
        <button
          onClick={() => onDecision(toolCall.id, "ask")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/25"
        >
          <HelpCircle size={12} />
          Ask
        </button>
        <button
          onClick={() => onDecision(toolCall.id, "deny")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/25"
        >
          <XCircle size={12} />
          Deny
        </button>
      </div>

      {/* Allow all for session link */}
      <div className="border-t border-border/60 px-3 py-2">
        <button
          onClick={onAllowAllSession}
          className="text-[10px] text-text-muted transition-colors hover:text-text-secondary"
        >
          Allow all for this session
        </button>
      </div>
    </div>
  )
}

interface PermissionBadgeProps {
  toolName: string
  decision: PermissionLevel
}

function PermissionBadge({ toolName, decision }: PermissionBadgeProps) {
  const styles: Record<
    PermissionLevel,
    { icon: ReactNode; className: string; label: string }
  > = {
    allow: {
      icon: <CheckCircle size={10} />,
      className: "bg-emerald-500/10 text-emerald-400",
      label: "Allowed",
    },
    deny: {
      icon: <XCircle size={10} />,
      className: "bg-red-500/10 text-red-400",
      label: "Denied",
    },
    ask: {
      icon: <HelpCircle size={10} />,
      className: "bg-amber-500/10 text-amber-400",
      label: "Asked",
    },
  }

  const s = styles[decision]

  return (
    <div
      className={cn(
        "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
        s.className
      )}
    >
      {s.icon}
      <span>{toolName}</span>
      <span className="opacity-60">{s.label}</span>
    </div>
  )
}

// Mock tool description generator
function getToolDescription(
  name: string,
  input: Record<string, unknown>
): string {
  const val = Object.values(input)[0]
  const str = typeof val === "string" ? val : null

  if (name.includes("read") || name.includes("get")) {
    return str ? `Wants to read: ${str}` : `Wants to read from ${name}`
  }
  if (name.includes("write") || name.includes("create")) {
    return str ? `Wants to create: ${str}` : `Wants to write via ${name}`
  }
  if (name.includes("delete") || name.includes("remove")) {
    return str ? `Wants to delete: ${str}` : `Wants to delete via ${name}`
  }
  if (name.includes("search")) {
    return str
      ? `Wants to search for "${str}"`
      : `Wants to run a search`
  }
  if (name.includes("update") || name.includes("edit")) {
    return str ? `Wants to update: ${str}` : `Wants to update via ${name}`
  }
  return `Wants to execute: ${name}`
}
