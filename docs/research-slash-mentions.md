# Slash Commands & @Mention Systems in AI Chat UIs

## Research Report — July 2026

---

## 1. Architecture Overview: How Slash Commands Work

### Two Fundamental Types

There are two distinct interaction patterns, and understanding the difference is critical:

| Pattern | Trigger | Purpose | Backend Effect |
|---------|---------|---------|---------------|
| **Slash Command** (`/`) | Typing `/` at start of input | Execute an action or mode switch | **Bypasses the LLM entirely** — runs a local handler, state mutation, or injects synthetic prompt |
| **@Mention** (`@`) | Typing `@` anywhere in input | Reference context (file, agent, user, skill) | **Injects resolved content into the prompt** — file contents, agent context, etc. are prepended/appended to what the LLM sees |

### Command Types (from Claude Code's architecture)

Claude Code uses a **discriminated union** pattern — three command execution modes:

```typescript
type Command = CommandBase & (
  | { type: "local";    load: () => Promise<{ call: LocalCommandFn }> }
  | { type: "local-jsx"; load: () => Promise<{ call: JSXCommandFn }> }  // opens React modal
  | { type: "prompt";   getPromptForCommand: (args, ctx) => Promise<ContentBlock[]> }
);
```

- **`local`** — Side-effecting handler, returns text. Never reaches the LLM. Examples: `/clear`, `/compact`, `/cost`
- **`local-jsx`** — Opens a React modal/pane. Examples: `/help`, `/login`, `/config`
- **`prompt`** — Produces content blocks injected as a synthetic user message. The LLM DOES see this. This is the bridge to skills.

### Slack/Discord Pattern (Platform-Native)

Slack and Discord use a completely different model — **server-registered commands**:

- Commands are registered via API (`POST /applications/{id}/commands` on Discord)
- When a user types `/`, the client shows a **native UI** populated from the registered command list
- Selection sends an **Interaction** payload to your server's webhook endpoint
- The server responds with a structured response (ephemeral message, modal, etc.)

```
User types "/" → Discord/Slack client shows native command palette → 
User selects command → Platform sends Interaction webhook to your server → 
Server processes & responds with interaction response
```

This is fundamentally different from web-based chat apps where you build the command UI yourself.

---

## 2. How @Mention Systems Work

### Cursor's @Mention System

Cursor is the gold standard for @mentions in AI chat. When you type `@`:

1. **Popup appears** listing mentionable categories: `@Files`, `@Folders`, `@Code`, `@Web`, `@Docs`, `@Git`, `@Codebase`
2. **Fuzzy search** filters results as you type after `@`
3. **Selection inserts a chip/block** — not plain text, but a visually distinct inline element
4. **On send**, Cursor resolves each mention — reads the file, extracts the symbol, runs the web search — and **injects the resolved content into the prompt**

```
User types: "Explain @Files:src/api/auth.ts and fix @Code:validateToken"
→ Cursor reads the file contents and extracts the function source
→ Prompt sent to LLM becomes: "Explain [FILE CONTENTS] and fix [FUNCTION SOURCE]..."
```

### Key Insight: Mentions are Prompt Engineering Automation

The @mention system is essentially a structured way to inject context into prompts. The user doesn't need to copy-paste code, describe files, or explain what they're referencing. The mention system resolves references and builds the prompt automatically.

---

## 3. React/Next.js Implementation Patterns

### Pattern A: Rich Text Editor (Tiptap/Lexical) — Production Grade

This is how Cursor, Instagram, and most production apps handle mentions. You replace the `<textarea>` with a rich text editor that supports inline "chip" nodes.

**Libraries:**
- **Tiptap** (`@tiptap/react`, `@tiptap/extension-mention`, `@tiptap/suggestion`)
- **Lexical** (`@lexical/react`, `@lexical/text`)
- **ProseMirror** (underlying both Tiptap and Lexical)

**How it works:**

```tsx
// Tiptap with Mention extension
import { useEditor, EditorContent } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import { Suggestion } from '@tiptap/suggestion'

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    Mention.configure({
      HTMLAttributes: { class: 'mention-chip' },
      suggestion: {
        char: '@',
        items: ({ query }) => {
          return files.filter(f => 
            f.name.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 8)
        },
        render: () => {
          // Returns { onStart, onUpdate, onKeyDown, onExit }
          // These control the floating suggestion dropdown
        },
        command: ({ editor, range, props }) => {
          editor.chain()
            .focus()
            .insertContentAt(range, [{
              type: 'mention',
              attrs: { id: props.id, label: props.label }
            }])
            .run()
        }
      }
    })
  ]
})

// Render
<EditorContent editor={editor} />
```

**Key concepts:**
- **Suggestion plugin** handles trigger detection, query extraction, dropdown positioning
- **Mention nodes** are atomic inline elements (chips) in the document
- **Floating UI** (`@floating-ui/dom`) positions the dropdown relative to the cursor
- On submit, you extract mention nodes and resolve their content separately

### Pattern B: Headless Hooks — Lightweight Alternative

For simpler chat inputs (no WYSIWYG needed), headless hooks are gaining traction:

**`@skyastrall/mentions-react`** (~6KB, zero dependencies):
```tsx
import { Mentions } from "@skyastrall/mentions-react"

<Mentions
  triggers={[
    { char: "@", data: users, color: "rgba(99,102,241,0.25)" },
    { char: "/", data: commands, color: "rgba(245,158,11,0.25)" },
  ]}
  onChange={(markup, plainText) => console.log(markup)}
/>
```

**`react-mentions-ts`** (mature, feature-rich):
```tsx
import { MentionsInput, Mention } from 'react-mentions-ts'

<MentionsInput value={value} onChange={handleChange}>
  <Mention
    trigger="@"
    data={(query) => fetchUsers(query)}
    renderSuggestion={(suggestion) => (
      <div>{suggestion.name}</div>
    )}
  />
</Mentions>
```

**`fude`** (AI autocomplete + mentions):
```tsx
<SmartTextbox
  value={segments}
  onChange={setSegments}
  onFetchMentions={async (query) => fuzzyFilter(query, files)}
  onFetchSuggestions={async (trailing) => ai.complete(trailing)}
/>
```

### Pattern C: Custom Trigger Detection — DIY Approach

Many projects implement their own detection without a full editor library:

```tsx
// Detection regex
const MENTION_REGEX = /(?:^|\s)@([^\s@]{0,200})$/

function detectMentionTrigger(value: string, caret: number): string | null {
  const before = value.slice(0, caret)
  const match = before.match(MENTION_REGEX)
  return match ? match[1] : null
}

// In your textarea onChange:
function handleInputChange(e) {
  const value = e.target.value
  const caret = e.target.selectionStart
  const query = detectMentionTrigger(value, caret)
  
  if (query !== null) {
    setMentionPanelOpen(true)
    setMentionQuery(query)
  } else {
    setMentionPanelOpen(false)
  }
}

// Dropdown positioned via getBoundingClientRect()
// Selection splices the @query segment, replacing it with formatted text
```

### Pattern D: assistant-ui's TriggerPopover System

The `assistant-ui` library provides a generic trigger system that handles both `/` and `@`:

```tsx
<ComposerPrimitive.Unstable_TriggerPopoverRoot>
  <ComposerPrimitive.Root>
    <ComposerPrimitive.Input placeholder="Type @ or /..." />
    
    {/* @ mentions — inserts directive chip */}
    <ComposerTriggerPopover
      char="@"
      adapter={mentionAdapter}
      directive={{ formatter: unstable_defaultDirectiveFormatter }}
    />
    
    {/* / commands — fires action callback */}
    <ComposerTriggerPopover
      char="/"
      action={{
        onExecute: (item) => commandHandlers[item.id]?.(),
        formatter: unstable_defaultDirectiveFormatter,
      }}
    />
  </ComposerPrimitive.Root>
</ComposerPrimitive.Unstable_TriggerPopoverRoot>
```

---

## 4. Reference Implementations

### ChatGPT Slash Commands

ChatGPT uses `/` commands as **mode switches**, not prompt templates:

| Command | Behavior |
|---------|----------|
| `/image` | Switches to image generation mode |
| `/canvas` | Opens persistent workspace |
| `/code` | Code-optimized attention mode |
| `/stuck` | Runs stuck-detection protocol |
| `/memory` | Shows stored context/instructions |
| `/gpt` | Model selector |

**Backend routing:** These are intercepted before reaching the LLM. The harness checks input for `/` prefix, routes to the appropriate handler, and either:
1. Mutates session state (mode switch)
2. Opens a UI panel
3. Returns a local response

### Cursor's @Mention System

**Input layer:**
- Rich text editor (likely Lexical-based based on DOM inspection)
- Custom `MentionNode` for inline chips
- Floating UI for dropdown positioning
- Fuzzy search across files, code symbols, docs, web

**Backend integration:**
```
User message with @mentions
→ Parse mentions from editor state
→ Resolve each mention (read file, extract symbol, search web)
→ Build enhanced prompt: [resolved context] + [user message]
→ Send to LLM
→ Stream response
```

### Claude Code's Command System

**Architecture (from source analysis):**

```typescript
// src/commands.ts — Registry
const COMMANDS: Command[] = [
  { type: 'local', name: 'clear', load: () => import('./clear.js') },
  { type: 'local', name: 'compact', load: () => import('./compact.js') },
  { type: 'local-jsx', name: 'help', load: () => import('./help.js') },
  { type: 'prompt', name: 'memory', getPromptForCommand: ... },
  // ... 80+ commands
]

// Dispatcher
function processSlashCommand(input: string) {
  const [commandName, ...args] = input.slice(1).split(/\s+/)
  const command = COMMANDS.find(c => 
    c.name === commandName || c.aliases?.includes(commandName)
  )
  
  if (!command) return null // Not a command, send to LLM
  
  switch (command.type) {
    case 'local':
      return command.call(args) // Never reaches LLM
    case 'local-jsx':
      return command.call(args, onDone) // Opens modal
    case 'prompt':
      return command.getPromptForCommand(args, context) // Injected into conversation
  }
}
```

### Discord/Slack Native Commands

```javascript
// Registration (Discord)
const commands = [
  {
    name: 'ask',
    description: 'Ask a question',
    options: [
      { name: 'query', type: 3, required: true, description: 'Your question' }
    ]
  }
];

// Handler
app.post('/interactions', (req, res) => {
  const { type, data } = req.body
  
  if (type === InteractionType.APPLICATION_COMMAND) {
    if (data.name === 'ask') {
      const query = data.options.find(o => o.name === 'query').value
      // Process query, respond
      res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `Answering: ${query}` }
      })
    }
  }
})
```

### shadcn Chat Command Palette Block

```tsx
// From shadcn.io — categorized slash commands with keyboard navigation
const commands = [
  { id: 'new', label: 'New Chat', icon: Plus, category: 'Session' },
  { id: 'clear', label: 'Clear Chat', icon: Trash2, category: 'Session' },
  { id: 'model', label: 'Switch Model', icon: Cpu, category: 'Settings' },
]

// Detection
const showCommands = input.startsWith('/')
const filtered = commands.filter(cmd => 
  cmd.label.toLowerCase().includes(query.toLowerCase())
)
```

---

## 5. Input Parsing & Detection

### Trigger Detection

The core challenge is detecting when the user has typed a trigger character and extracting the query:

```tsx
// Slash commands — typically at start of input
function detectSlashCommand(input: string): string | null {
  if (!input.startsWith('/')) return null
  const spaceIndex = input.indexOf(' ')
  if (spaceIndex === -1) return input.slice(1) // /clear
  return input.slice(1, spaceIndex) // /translate from /translate en
}

// @ mentions — anywhere in input, caret-aware
function detectMention(input: string, caret: number): string | null {
  const before = input.slice(0, caret)
  const match = before.match(/(?:^|\s)@([^\s@]{0,200})$/)
  return match ? match[1] : null
}

// Cursor @ mentions — multiple trigger types
const TRIGGER_CHARS = ['@']
// After @, further typing filters: @Files → @Files:src/api/auth.ts
```

### Autocomplete Dropdown

```
┌─────────────────────────────┐
│ 🔍 Search commands...       │
├─────────────────────────────┤
│ 📁 Session                  │
│   /new        New chat      │
│   /clear      Clear chat    │ ← highlighted
│   /rename     Rename chat   │
├─────────────────────────────┤
│ ⚙️ Settings                 │
│   /model      Switch model  │
│   /memory     View memory   │
└─────────────────────────────┘
        ↑ positioned above input
```

**Keyboard navigation:**
- Arrow Up/Down: Move selection
- Enter: Execute selected command
- Escape: Close dropdown
- Continue typing: Filter commands
- Tab: Autocomplete (ghost text)

### Command with Arguments

```tsx
// /translate en → command="translate", args="en"
// /ask what is React → command="ask", args="what is React"

const SLASH_COMMANDS = [
  {
    id: 'translate',
    description: 'Translate to another language',
    execute: (args) => {
      const lang = args.split(' ')[0] // "en"
      const text = args.split(' ').slice(1).join(' ')
      // Handle translation
    }
  }
]
```

---

## 6. Backend Integration Patterns

### Pattern 1: Command Intercepts Before LLM

```
User Input → Command Router → [If /command] → Local Handler → Response
                                              → [If @mention] → Resolve Context → Enhanced Prompt → LLM
                                              → [If plain]   → LLM
```

```typescript
// Backend command router
async function processMessage(input: string, sessionId: string) {
  // 1. Check for slash command
  if (input.startsWith('/')) {
    const [cmd, ...args] = input.slice(1).split(/\s+/)
    const handler = commandRegistry.get(cmd)
    if (handler) return handler.execute(args, sessionId)
  }
  
  // 2. Parse and resolve @mentions
  const mentions = extractMentions(input)
  const resolvedContext = await Promise.all(
    mentions.map(m => resolveMention(m, sessionId))
  )
  
  // 3. Build enhanced prompt
  const enhancedPrompt = buildPrompt(input, resolvedContext)
  
  // 4. Send to LLM
  return llm.complete(enhancedPrompt)
}
```

### Pattern 2: Mention Resolution Pipeline

```typescript
async function resolveMention(mention: MentionRef, sessionId: string) {
  switch (mention.type) {
    case 'file':
      const content = await readFile(mention.path)
      return { type: 'file', path: mention.path, content }
    
    case 'code':
      const symbol = await extractSymbol(mention.file, mention.symbol)
      return { type: 'code', symbol: mention.symbol, source: symbol }
    
    case 'web':
      const results = await webSearch(mention.query)
      return { type: 'web', query: mention.query, results }
    
    case 'agent':
      const agent = await loadAgent(mention.agentId)
      return { type: 'agent', name: agent.name, systemPrompt: agent.prompt }
    
    case 'skill':
      const skill = await loadSkill(mention.skillId)
      return { type: 'skill', name: skill.name, instructions: skill.content }
  }
}
```

### Pattern 3: Prompt Injection Format

```typescript
function buildPrompt(userMessage: string, contexts: ResolvedContext[]) {
  const contextBlocks = contexts.map(ctx => {
    switch (ctx.type) {
      case 'file':
        return `<file path="${ctx.path}">\n${ctx.content}\n</file>`
      case 'code':
        return `<symbol name="${ctx.symbol}">\n${ctx.source}\n</symbol>`
      case 'agent':
        return `<agent name="${ctx.name}">\n${ctx.systemPrompt}\n</agent>`
      case 'skill':
        return `<skill name="${ctx.name}">\n${ctx.instructions}\n</skill>`
    }
  })
  
  return [
    ...contextBlocks,
    { role: 'user', content: userMessage }
  ]
}
```

### Pattern 4: Dynamic Command Registry (Production)

```typescript
// Commands from multiple sources, merged at runtime
async function getCommands(workingDir: string): Promise<Command[]> {
  const [builtinSkills, pluginSkills, pluginCommands, workflowCommands] = 
    await Promise.all([
      loadBuiltinSkills(),
      loadPluginSkills(),
      loadPluginCommands(),
      loadWorkflowCommands(workingDir),
    ])
  
  return [
    ...pluginSkills,      // Highest priority (user-installed)
    ...workflowCommands,  // Project-local
    ...pluginCommands,    // User-global
    ...builtinSkills,     // System defaults
    ...BUILTIN_COMMANDS,  // Always present
  ].filter(cmd => meetsAvailability(cmd) && cmd.isEnabled())
}
```

---

## 7. Component Architecture Summary

### Minimal Working Implementation

```tsx
// Complete slash command + @mention input component
function ChatInput({ onSend }) {
  const [input, setInput] = useState('')
  const [slashOpen, setSlashOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  const handleChange = (e) => {
    const value = e.target.value
    const caret = e.target.selectionStart
    setInput(value)
    
    // Detect triggers
    if (value.startsWith('/')) {
      setSlashOpen(true)
      setMentionOpen(false)
      setQuery(value.slice(1))
    } else {
      const mentionQuery = detectMentionTrigger(value, caret)
      if (mentionQuery !== null) {
        setMentionOpen(true)
        setSlashOpen(false)
        setQuery(mentionQuery)
      } else {
        setSlashOpen(false)
        setMentionOpen(false)
      }
    }
  }
  
  const handleKeyDown = (e) => {
    if (slashOpen || mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => i + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectItem(filteredItems[selectedIndex])
      } else if (e.key === 'Escape') {
        setSlashOpen(false)
        setMentionOpen(false)
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  return (
    <div className="relative">
      {slashOpen && <SlashCommandDropdown ... />}
      {mentionOpen && <MentionDropdown ... />}
      <textarea value={input} onChange={handleChange} onKeyDown={handleKeyDown} />
    </div>
  )
}
```

### Production-Ready Library Choices

| Library | Size | Features | Best For |
|---------|------|----------|----------|
| `@assistant-ui/react` | Full | Both @ and /, directive chips, Lexical | Full chat UIs |
| `@skyastrall/mentions-react` | ~6KB | Multi-trigger, headless, ARIA | Lightweight inputs |
| `react-mentions-ts` | Medium | Mature, async, inline autocomplete | Established projects |
| `fude` | Medium | Mentions + AI autocomplete | AI-powered inputs |
| `@tiptap/react` + mention | Full | Rich editor, WYSIWYG | Editor-centric UIs |
| Custom (DIY) | 0KB | Full control | Unique requirements |

---

## 8. Key Takeaways

1. **Slash commands = harness control** — They intercept input BEFORE the LLM. The model never sees `/clear`. This is a user→harness channel, not a user→model channel.

2. **@Mentions = prompt engineering automation** — They resolve references and inject context into the prompt. The LLM sees the resolved content but not the mention syntax.

3. **Rich text editors (Tiptap/Lexical) are the standard** for production @mentions — they render mentions as styled inline chips, not plain text.

4. **The trigger detection is simple regex** — `(?:^|\s)@([^\s@]+)$` for mentions, `input.startsWith('/')` for commands.

5. **Backend integration is a pipeline** — Parse triggers → resolve references → build enhanced prompt → route to handler or LLM.

6. **Command registries should be dynamic** — Built-in + plugin + skill + workflow commands, merged at runtime with priority ordering.

7. **The same trigger system can serve both patterns** — Use one `TriggerPopoverRoot` with separate `TriggerPopover` declarations for `@` and `/`, each with its own behavior (directive insertion vs. action execution).
