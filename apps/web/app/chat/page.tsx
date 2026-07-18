'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Settings, Menu, X, Send, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  updated_at: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/conversations`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const createConversation = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title: 'New conversation' })
      });
      const data = await res.json();
      setConversations(prev => [{ ...data, updated_at: Date.now() }, ...prev]);
      setActiveConversation(data.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || !activeConversation || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_URL}/chat/conversations/${activeConversation}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content: inputValue })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantContent += chunk;

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: assistantContent }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar Drawer */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-[#141618] border-r border-[#2c2e33] transform transition-transform duration-200 ease-in-out",
        drawerOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-[#2c2e33]">
          <h2 className="text-lg font-semibold">Conversations</h2>
          <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-[#25262b] rounded">
            <X size={18} />
          </button>
        </div>
        <div className="p-2">
          <button
            onClick={createConversation}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-[#e8590c] hover:bg-[#d4520e] text-white rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Conversation
          </button>
        </div>
        <div className="overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveConversation(conv.id);
                setDrawerOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors",
                activeConversation === conv.id
                  ? "bg-[#25262b] text-white"
                  : "text-[#909296] hover:bg-[#1c1e20]"
              )}
            >
              <div className="truncate">{conv.title}</div>
              <div className="text-xs text-[#909296] mt-1">{conv.model}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[#2c2e33] bg-[#0d0f11]">
          <button onClick={() => setDrawerOpen(true)} className="p-1 hover:bg-[#25262b] rounded">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-[#e8590c]" />
            <span className="font-medium">Agent</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="p-1 hover:bg-[#25262b] rounded">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-[#909296]">
              <Sparkles size={48} className="mb-4 text-[#e8590c]" />
              <h2 className="text-xl font-medium mb-2">How can I help you today?</h2>
              <p className="text-sm">Start a conversation or create a new one</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={cn(
              "flex gap-3 max-w-3xl mx-auto",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-[#e8590c] flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className={cn(
                "px-4 py-3 rounded-2xl max-w-[80%]",
                msg.role === 'user'
                  ? "bg-[#e8590c] text-white"
                  : "bg-[#1c1e20] text-[#e4e5e7]"
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[#25262b] flex items-center justify-center flex-shrink-0">
                  <User size={16} />
                </div>
              )}
            </div>
          ))}
          {isStreaming && (
            <div className="flex gap-3 max-w-3xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-[#e8590c] flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-[#1c1e20]">
                <div className="streaming-indicator flex gap-1">
                  <span className="w-2 h-2 bg-[#909296] rounded-full"></span>
                  <span className="w-2 h-2 bg-[#909296] rounded-full"></span>
                  <span className="w-2 h-2 bg-[#909296] rounded-full"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Bottom anchored */}
        <div className="p-4 border-t border-[#2c2e33] bg-[#0d0f11]">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-[#141618] rounded-2xl border border-[#2c2e33] p-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-transparent resize-none outline-none px-3 py-2 text-sm max-h-32"
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || !activeConversation || isStreaming}
                className={cn(
                  "p-2 rounded-xl transition-colors",
                  inputValue.trim() && activeConversation && !isStreaming
                    ? "bg-[#e8590c] hover:bg-[#d4520e] text-white"
                    : "bg-[#25262b] text-[#909296] cursor-not-allowed"
                )}
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-xs text-[#909296] text-center mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
