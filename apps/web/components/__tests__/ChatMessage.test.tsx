import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ChatMessage } from '../chat/ChatMessage.js';

vi.mock('@/stores/chat', () => ({
  useChatStore: vi.fn(() => ({
    setActiveArtifact: vi.fn(),
    setArtifactViewerOpen: vi.fn(),
  })),
}));

vi.mock('lucide-react', () => ({
  Bot: () => React.createElement('span', null, 'Bot'),
  User: () => React.createElement('span', null, 'User'),
  Copy: () => React.createElement('span', null, 'Copy'),
  Check: () => React.createElement('span', null, 'Check'),
  CheckCircle: () => React.createElement('span', null, 'CheckCircle'),
  XCircle: () => React.createElement('span', null, 'XCircle'),
  HelpCircle: () => React.createElement('span', null, 'HelpCircle'),
  Shield: () => React.createElement('span', null, 'Shield'),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('remark-gfm', () => ({
  default: () => {},
}));

vi.mock('../chat/MessageActions.js', () => ({
  MessageActions: () => React.createElement('span', null, 'MessageActions'),
}));

vi.mock('../chat/ToolIndicator.js', () => ({
  ToolIndicator: () => React.createElement('span', null, 'ToolIndicator'),
}));

vi.mock('../chat/QuestionForm.js', () => ({
  QuestionForm: () => React.createElement('span', null, 'QuestionForm'),
}));

const baseUserMsg = { id: 'msg-1', role: 'user' as const, content: 'Hello world', timestamp: Date.now() };
const baseAsstMsg = { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!', timestamp: Date.now() };

describe('ChatMessage component', () => {
  describe('basic rendering', () => {
    it('renders user message without crash', () => {
      expect(() => renderToString(React.createElement(ChatMessage, { message: baseUserMsg }))).not.toThrow();
    });

    it('renders assistant message without crash', () => {
      expect(() => renderToString(React.createElement(ChatMessage, { message: baseAsstMsg }))).not.toThrow();
    });

    it('contains message content in output', () => {
      const html = renderToString(React.createElement(ChatMessage, { message: { ...baseAsstMsg, content: 'How can I help?' } }));
      expect(html).toContain('How can I help?');
    });

    it('uses justify-end for user', () => {
      const html = renderToString(React.createElement(ChatMessage, { message: baseUserMsg }));
      expect(html).toContain('justify-end');
    });

    it('uses justify-start for assistant', () => {
      const html = renderToString(React.createElement(ChatMessage, { message: baseAsstMsg }));
      expect(html).toContain('justify-start');
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      expect(() => renderToString(React.createElement(ChatMessage, { message: { ...baseAsstMsg, content: '' } }))).not.toThrow();
    });

    it('handles long content', () => {
      expect(() => renderToString(React.createElement(ChatMessage, { message: { ...baseAsstMsg, content: 'A'.repeat(10000) } }))).not.toThrow();
    });

    it('accepts isLast prop', () => {
      expect(() => renderToString(React.createElement(ChatMessage, { message: baseAsstMsg, isLast: true }))).not.toThrow();
    });
  });
});
