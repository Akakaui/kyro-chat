"use client"

import { useState } from "react"
import {
  ArrowLeft,
  ChevronRight,
  Mail,
  Reply,
  Send,
  Settings,
  Inbox,
  Plus,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

interface EmailSettings {
  userEmail: string
  agentDisplayName: string
  notifications: {
    taskComplete: boolean
    scheduledDone: boolean
    actionRequired: boolean
  }
}

interface EmailAccount {
  id: string
  provider: string
  email: string
  connected: boolean
}

interface Email {
  id: string
  from: string
  fromEmail: string
  subject: string
  preview: string
  body: string
  time: string
  read: boolean
}

const mockAccount: EmailAccount = {
  id: "acc1",
  provider: "Gmail",
  email: "user@example.com",
  connected: true,
}

const mockEmails: Email[] = [
  {
    id: "1",
    from: "John",
    fromEmail: "john@acme.co",
    subject: "Project update",
    preview: "Hey, here is the latest update on the Q3 roadmap...",
    body: "Hey,\n\nHere is the latest update on the Q3 roadmap. We've made solid progress on the API migration and are on track for the July release.\n\nKey highlights:\n- Auth service migration: 90% complete\n- New dashboard: in review\n- Performance improvements: 40% faster load times\n\nLet me know if you have questions.\n\n— John",
    time: "2h ago",
    read: false,
  },
  {
    id: "2",
    from: "Sara",
    fromEmail: "sara@team.io",
    subject: "Meeting notes",
    preview: "Attached are the notes from today's sprint planning...",
    body: "Hi team,\n\nAttached are the notes from today's sprint planning session. We've prioritized the following items for next sprint:\n\n1. Fix authentication timeout bug\n2. Implement email integration\n3. Add keyboard shortcuts\n\nPlease review and flag any concerns by EOD Wednesday.\n\nThanks,\nSara",
    time: "1d ago",
    read: true,
  },
  {
    id: "3",
    from: "GitHub",
    fromEmail: "noreply@github.com",
    subject: "[kyro-chat] PR #142 merged",
    preview: "Pull request #142 'Add knowledge base UI' has been...",
    body: "Pull request #142 'Add knowledge base UI' has been merged into main.\n\nMerged by: @dev\nFiles changed: 8\nAdditions: 342\nDeletions: 12",
    time: "3d ago",
    read: true,
  },
]

const defaultSettings: EmailSettings = {
  userEmail: "",
  agentDisplayName: "Kyro",
  notifications: {
    taskComplete: true,
    scheduledDone: true,
    actionRequired: true,
  },
}

export function EmailPanel() {
  const [connected, setConnected] = useState(mockAccount.connected)
  const [emails, setEmails] = useState<Email[]>(mockEmails)
  const [activeEmail, setActiveEmail] = useState<Email | null>(null)
  const [showConnectForm, setShowConnectForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEmailSettings, setShowEmailSettings] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [connectEmail, setConnectEmail] = useState("")
  const [connectProvider, setConnectProvider] = useState("gmail")
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(defaultSettings)
  const [testEmailSent, setTestEmailSent] = useState(false)

  function markRead(id: string) {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)))
  }

  function updateNotification(key: keyof EmailSettings["notifications"], value: boolean) {
    setEmailSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  function sendTestEmail() {
    if (!emailSettings.userEmail) return
    setTestEmailSent(true)
    setTimeout(() => setTestEmailSent(false), 3000)
  }

  // Email settings view
  if (showEmailSettings) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <button
            onClick={() => setShowEmailSettings(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-text-primary">Email Settings</span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {/* Agent email display */}
            <div>
              <label className="mb-2 block text-xs text-text-muted">Agent Email Address</label>
              <div className="rounded-lg border border-border bg-bg-tertiary px-3 py-2">
                <p className="text-sm text-text-secondary">
                  agent-kyro@kyro.chat
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  This is the email your agent sends from
                </p>
              </div>
            </div>

            {/* User email */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Your Email Address
              </label>
              <Input
                type="email"
                value={emailSettings.userEmail}
                onChange={(e) =>
                  setEmailSettings((prev) => ({ ...prev, userEmail: e.target.value }))
                }
                placeholder="you@example.com"
                className="h-9 text-sm"
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Where notifications will be sent
              </p>
            </div>

            {/* Agent display name */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Agent Display Name
              </label>
              <Input
                value={emailSettings.agentDisplayName}
                onChange={(e) =>
                  setEmailSettings((prev) => ({
                    ...prev,
                    agentDisplayName: e.target.value,
                  }))
                }
                placeholder="Kyro"
                className="h-9 text-sm"
              />
            </div>

            {/* Notification preferences */}
            <div>
              <label className="mb-3 block text-xs text-text-muted">
                Notification Preferences
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Task Complete</p>
                    <p className="text-[11px] text-text-muted">
                      When a task finishes successfully
                    </p>
                  </div>
                  <Switch
                    checked={emailSettings.notifications.taskComplete}
                    onCheckedChange={(v) => updateNotification("taskComplete", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Scheduled Task Done</p>
                    <p className="text-[11px] text-text-muted">
                      When a scheduled task completes
                    </p>
                  </div>
                  <Switch
                    checked={emailSettings.notifications.scheduledDone}
                    onCheckedChange={(v) => updateNotification("scheduledDone", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Action Required</p>
                    <p className="text-[11px] text-text-muted">
                      When agent needs your input
                    </p>
                  </div>
                  <Switch
                    checked={emailSettings.notifications.actionRequired}
                    onCheckedChange={(v) => updateNotification("actionRequired", v)}
                  />
                </div>
              </div>
            </div>

            {/* Test email */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={sendTestEmail}
                disabled={!emailSettings.userEmail}
                className="gap-1.5"
              >
                {testEmailSent ? (
                  <>
                    <Check size={14} />
                    Test Email Sent
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Not connected state
  if (!connected && !showConnectForm) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <span className="text-sm font-semibold text-text-primary">Email</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
            <Mail size={28} className="text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-primary">Connect your email</p>
          <p className="mt-1 max-w-[220px] text-xs text-text-muted">
            Let Kyro read and respond to emails on your behalf
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowConnectForm(true)}>
            <Plus size={14} />
            Connect Email
          </Button>
        </div>
      </div>
    )
  }

  // Connect form
  if (!connected && showConnectForm) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <button
            onClick={() => setShowConnectForm(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-text-primary">Connect Email</span>
        </div>
        <div className="flex-1 space-y-4 p-4">
          <div>
            <label className="mb-2 block text-xs text-text-muted">Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {providerOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setConnectProvider(p.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors",
                    connectProvider === p.id
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-border bg-bg-secondary text-text-secondary hover:border-text-muted"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-tertiary text-sm font-bold">
                    {p.icon}
                  </div>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-muted">Email address</label>
            <Input
              type="email"
              value={connectEmail}
              onChange={(e) => setConnectEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 text-sm"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => {
              if (connectEmail.trim()) {
                setConnected(true)
                setShowConnectForm(false)
              }
            }}
            disabled={!connectEmail.trim()}
          >
            Connect
          </Button>
        </div>
      </div>
    )
  }

  // Email detail view
  if (activeEmail) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <button
            onClick={() => {
              setActiveEmail(null)
              setReplyOpen(false)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="flex-1 truncate text-sm font-semibold text-text-primary">
            {activeEmail.subject}
          </span>
          <button
            onClick={() => setReplyOpen(!replyOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-accent"
          >
            <Reply size={14} />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
                {activeEmail.from[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{activeEmail.from}</p>
                <p className="text-xs text-text-muted">{activeEmail.fromEmail}</p>
              </div>
              <span className="ml-auto text-xs text-text-muted">{activeEmail.time}</span>
            </div>

            <div className="whitespace-pre-wrap rounded-xl border border-border bg-bg-secondary p-4 text-sm leading-relaxed text-text-secondary">
              {activeEmail.body}
            </div>

            {replyOpen && (
              <div className="mt-4 space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  rows={4}
                  className="resize-none text-sm"
                />
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5">
                    <Send size={12} />
                    Send Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Inbox view (connected)
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">Inbox</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowEmailSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            title="Email Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Agent email info */}
      <div className="border-b border-border bg-bg-secondary px-3 py-2">
        <p className="text-[11px] text-text-muted">
          Agent sends from: <span className="text-text-secondary">agent-kyro@kyro.chat</span>
        </p>
      </div>

      {/* Email list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {emails.map((email) => (
            <button
              key={email.id}
              onClick={() => {
                markRead(email.id)
                setActiveEmail(email)
              }}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-bg-secondary",
                !email.read && "bg-bg-secondary/50"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                {email.from[0]}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      email.read ? "text-text-secondary" : "font-semibold text-text-primary"
                    )}
                  >
                    {email.from}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted">{email.time}</span>
                </div>
                <p
                  className={cn(
                    "truncate text-sm",
                    email.read ? "text-text-muted" : "text-text-primary"
                  )}
                >
                  {email.subject}
                </p>
                <p className="truncate text-xs text-text-muted">{email.preview}</p>
              </div>

              {!email.read && (
                <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
              )}

              <ChevronRight size={14} className="mt-2 shrink-0 text-text-muted" />
            </button>
          ))}
        </div>

        <div className="p-4">
          <Button
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => setShowConnectForm(true)}
          >
            <Plus size={14} />
            Connect another account
          </Button>
        </div>
      </ScrollArea>
    </div>
  )
}

const providerOptions = [
  { id: "gmail", label: "Gmail", icon: "G" },
  { id: "outlook", label: "Outlook", icon: "O" },
  { id: "imap", label: "Custom IMAP", icon: "M" },
]
