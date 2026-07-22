"use client"

import { useState, useEffect } from "react"
import {
  Mail, Settings, Send, RefreshCw, Inbox, FileText, Trash2, Search,
  Plus, CheckCircle2, XCircle, AlertCircle, Loader2, X, Eye, EyeOff,
  ChevronDown, ChevronRight, Clock, User, ArrowUpRight
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  fetchEmailInbox, markEmailAsRead, markEmailAsUnread,
  getEmailSettings, updateEmailSettings, configureEmail,
  sendTestEmail, getEmailLogs, startEmailPolling, stopEmailPolling,
  type EmailMessage
} from "@/lib/api"

type View = "inbox" | "compose" | "settings" | "logs"

export function EmailPanel({ onClose }: { onClose?: () => void }) {
  const [view, setView] = useState<View>("inbox")
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [settings, setSettings] = useState({
    userEmail: "",
    agentDisplayName: "Kyro",
    notifications: { taskComplete: true, scheduledDone: true, actionRequired: true },
  })
  const [smtpConfig, setSmtpConfig] = useState({ host: "", port: 587, secure: false, user: "", password: "" })
  const [imapConfig, setImapConfig] = useState({ host: "", port: 993, user: "", password: "", tls: true })
  const [configuring, setConfiguring] = useState(false)
  const [configStatus, setConfigStatus] = useState<"idle" | "success" | "error">("idle")
  const [composeTo, setComposeTo] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [sending, setSending] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (view === "inbox") loadInbox()
    if (view === "logs") loadLogs()
  }, [view])

  async function loadSettings() {
    try {
      const data = await getEmailSettings()
      setSettings(data.settings)
    } catch (err: any) {
      console.error("Failed to load email settings:", err)
    }
  }

  async function loadInbox() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEmailInbox(50)
      setEmails(data.emails)
    } catch (err: any) {
      setError(err.message || "Failed to load inbox")
    } finally {
      setLoading(false)
    }
  }

  async function loadLogs() {
    try {
      const data = await getEmailLogs()
      setLogs(data.logs)
    } catch (err: any) {
      console.error("Failed to load logs:", err)
    }
  }

  async function handleMarkRead(email: EmailMessage) {
    try {
      await markEmailAsRead(email.id)
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e))
      if (selectedEmail?.id === email.id) {
        setSelectedEmail({ ...email, isRead: true })
      }
    } catch (err: any) {
      console.error("Failed to mark as read:", err)
    }
  }

  async function handleMarkUnread(email: EmailMessage) {
    try {
      await markEmailAsUnread(email.id)
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: false } : e))
      if (selectedEmail?.id === email.id) {
        setSelectedEmail({ ...email, isRead: false })
      }
    } catch (err: any) {
      console.error("Failed to mark as unread:", err)
    }
  }

  async function handleSaveSettings() {
    try {
      await updateEmailSettings(settings)
    } catch (err: any) {
      console.error("Failed to save settings:", err)
    }
  }

  async function handleConfigure() {
    setConfiguring(true)
    setConfigStatus("idle")
    try {
      await configureEmail(smtpConfig, imapConfig)
      setConfigStatus("success")
    } catch (err: any) {
      setConfigStatus("error")
    } finally {
      setConfiguring(false)
    }
  }

  async function handleSendTest() {
    if (!settings.userEmail) return
    try {
      await sendTestEmail(settings.userEmail)
    } catch (err: any) {
      console.error("Failed to send test email:", err)
    }
  }

  async function handleTogglePolling() {
    try {
      if (polling) {
        await stopEmailPolling()
        setPolling(false)
      } else {
        await startEmailPolling(30000)
        setPolling(true)
      }
    } catch (err: any) {
      console.error("Failed to toggle polling:", err)
    }
  }

  const filteredEmails = emails.filter(email =>
    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.from.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: "inbox" as View, label: "Inbox", icon: Inbox },
    { id: "compose" as View, label: "Compose", icon: Send },
    { id: "settings" as View, label: "Settings", icon: Settings },
    { id: "logs" as View, label: "Logs", icon: FileText },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 right-6 w-[480px] h-[600px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <Mail className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-medium text-white">Email</h3>
          {polling && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setView(tab.id); setSelectedEmail(null) }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
              view === tab.id
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {view === "inbox" && (
            <motion.div
              key="inbox"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full"
            >
              {/* Search + Refresh */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={loadInbox}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={handleTogglePolling}
                  className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                    polling
                      ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {polling ? "Stop" : "Poll"}
                </button>
              </div>

              {/* Email List */}
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-gray-400 text-center">{error}</p>
                  <button
                    onClick={loadInbox}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-white transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                  <Inbox className="w-8 h-8 text-gray-600" />
                  <p className="text-sm text-gray-500">
                    {searchQuery ? "No emails match your search" : "No emails in inbox"}
                  </p>
                  {!searchQuery && (
                    <p className="text-xs text-gray-600">Configure IMAP in Settings to receive emails</p>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {filteredEmails.map(email => (
                    <div
                      key={email.id}
                      onClick={() => { setSelectedEmail(email); handleMarkRead(email) }}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/50 transition-colors ${
                        !email.isRead ? "bg-gray-800/30" : ""
                      }`}
                    >
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        email.isRead ? "bg-transparent" : "bg-blue-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs truncate ${!email.isRead ? "font-semibold text-white" : "text-gray-300"}`}>
                            {email.from || "Unknown"}
                          </span>
                          <span className="text-[10px] text-gray-500 flex-shrink-0">
                            {new Date(email.date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 truncate ${!email.isRead ? "font-medium text-gray-200" : "text-gray-400"}`}>
                          {email.subject}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                          {email.text?.slice(0, 80)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === "compose" && (
            <motion.div
              key="compose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-3"
            >
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={e => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Body</label>
                <textarea
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  placeholder="Write your email..."
                  rows={10}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <button
                disabled={!composeTo || !composeSubject || !composeBody || sending}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? "Sending..." : "Send Email"}
              </button>
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              {/* Email Address */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Your Email Address</label>
                <input
                  type="email"
                  value={settings.userEmail}
                  onChange={e => setSettings(s => ({ ...s, userEmail: e.target.value }))}
                  onBlur={handleSaveSettings}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Agent Display Name */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent Display Name</label>
                <input
                  type="text"
                  value={settings.agentDisplayName}
                  onChange={e => setSettings(s => ({ ...s, agentDisplayName: e.target.value }))}
                  onBlur={handleSaveSettings}
                  placeholder="Kyro"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Notification Toggles */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Notifications</label>
                {[
                  { key: "taskComplete" as const, label: "Task Complete" },
                  { key: "scheduledDone" as const, label: "Scheduled Task Done" },
                  { key: "actionRequired" as const, label: "Action Required" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                    <span className="text-xs text-gray-300">{label}</span>
                    <button
                      onClick={() => {
                        const newSettings = {
                          ...settings,
                          notifications: {
                            ...settings.notifications,
                            [key]: !settings.notifications[key],
                          },
                        }
                        setSettings(newSettings)
                        updateEmailSettings(newSettings)
                      }}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        settings.notifications[key] ? "bg-blue-600" : "bg-gray-700"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.notifications[key] ? "left-4.5" : "left-0.5"
                      }`} />
                    </button>
                  </label>
                ))}
              </div>

              {/* SMTP Configuration */}
              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-xs font-medium text-gray-300 mb-3">SMTP Configuration</h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={smtpConfig.host}
                      onChange={e => setSmtpConfig(s => ({ ...s, host: e.target.value }))}
                      placeholder="SMTP Host"
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={smtpConfig.port}
                      onChange={e => setSmtpConfig(s => ({ ...s, port: parseInt(e.target.value) || 587 }))}
                      placeholder="Port"
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={smtpConfig.user}
                    onChange={e => setSmtpConfig(s => ({ ...s, user: e.target.value }))}
                    placeholder="SMTP Username"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="password"
                    value={smtpConfig.password}
                    onChange={e => setSmtpConfig(s => ({ ...s, password: e.target.value }))}
                    placeholder="SMTP Password"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* IMAP Configuration */}
              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-xs font-medium text-gray-300 mb-3">IMAP Configuration</h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={imapConfig.host}
                      onChange={e => setImapConfig(s => ({ ...s, host: e.target.value }))}
                      placeholder="IMAP Host"
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={imapConfig.port}
                      onChange={e => setImapConfig(s => ({ ...s, port: parseInt(e.target.value) || 993 }))}
                      placeholder="Port"
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={imapConfig.user}
                    onChange={e => setImapConfig(s => ({ ...s, user: e.target.value }))}
                    placeholder="IMAP Username"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="password"
                    value={imapConfig.password}
                    onChange={e => setImapConfig(s => ({ ...s, password: e.target.value }))}
                    placeholder="IMAP Password"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Configure Button */}
              <button
                onClick={handleConfigure}
                disabled={configuring || !smtpConfig.host || !imapConfig.host}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
              >
                {configuring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {configuring ? "Configuring..." : "Save Configuration"}
              </button>

              {configStatus === "success" && (
                <p className="text-xs text-green-400 text-center">Configuration saved successfully</p>
              )}
              {configStatus === "error" && (
                <p className="text-xs text-red-400 text-center">Failed to save configuration</p>
              )}

              {/* Test Email */}
              <button
                onClick={handleSendTest}
                disabled={!settings.userEmail}
                className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-xs text-gray-300 transition-colors"
              >
                Send Test Email
              </button>
            </motion.div>
          )}

          {view === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <FileText className="w-8 h-8 text-gray-600" />
                  <p className="text-sm text-gray-500">No email logs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log: any) => (
                    <div key={log.id} className="p-3 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-300 truncate">{log.subject}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          log.status === "sent" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">To: {log.to_address}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Email Detail Modal */}
        <AnimatePresence>
          {selectedEmail && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900 z-10 flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => selectedEmail.isRead ? handleMarkUnread(selectedEmail) : handleMarkRead(selectedEmail)}
                    className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                    title={selectedEmail.isRead ? "Mark as unread" : "Mark as read"}
                  >
                    {selectedEmail.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-medium text-white mb-2">{selectedEmail.subject}</h3>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-4">
                  <span>From: {selectedEmail.from}</span>
                  <span>·</span>
                  <span>{new Date(selectedEmail.date).toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {selectedEmail.text}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
