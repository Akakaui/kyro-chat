"use client"

import { useState } from "react"
import { Bot, User, ChevronDown, ChevronRight, Copy, Check } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import type { Message } from "@/lib/api"
import { useChatStore } from "@/stores/chat"

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const { setActiveArtifact, setArtifactViewerOpen } = useChatStore()

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-2 md:px-0",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] md:max-w-[70%]",
          isUser ? "order-1" : "order-2"
        )}
      >
        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-primary"
          )}
        >
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

        {/* Tool use indicators */}
        {message.tool_use && message.tool_use.length > 0 && (
          <ToolUseIndicator tools={message.tool_use} />
        )}

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

      {/* User avatar */}
      {isUser && (
        <div className="order-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary">
          <User size={16} className="text-text-secondary" />
        </div>
      )}
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

// Collapsible tool use indicator
function ToolUseIndicator({ tools }: { tools: Message["tool_use"] }) {
  const [expanded, setExpanded] = useState(false)

  if (!tools || tools.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {tools.length} tool{tools.length !== 1 ? "s" : ""} used
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 pl-4">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="text-xs text-text-muted"
            >
              <span className="font-mono text-accent">{tool.name}</span>
              {tool.output && (
                <span className="ml-2 text-text-muted">
                  {tool.output.slice(0, 60)}
                  {tool.output.length > 60 ? "..." : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
