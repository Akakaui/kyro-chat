# Kyro Chat — UI Specification

> **Date:** 2025-07-18
> **Status:** Draft v1.0
> **Reference App:** Ava Chat (screenshots analyzed)
> **Platform:** Mobile-first, responsive to desktop

---

## Table of Contents

1. [Layout Architecture](#1-layout-architecture)
2. [Design Tokens](#2-design-tokens)
3. [Component Inventory](#3-component-inventory)
4. [Screen-by-Screen Breakdown](#4-screen-by-screen-breakdown)
5. [Interaction Patterns](#5-interaction-patterns)
6. [Mobile-First Priorities](#6-mobile-first-priorities)
7. [Key Screens to Build](#7-key-screens-to-build)

---

## 1. Layout Architecture

### 1.1 Mobile Layout (Primary)

```
┌──────────────────────────────┐
│  ←  [Incognito]    [Menu ≡] │  ← Top bar (optional, auto-hide on scroll)
│                              │
│                              │
│     What's on your mind      │
│         today?               │  ← Centered greeting (shown when no active chat)
│                              │
│                              │
│  ┌────────────────────────┐  │
│  │ + │ Model ▾ │ 🎤 │ ➤  │  │  ← Bottom input bar (always visible)
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**Slide-in Panel (Right → Left):**
```
┌────────────────────────┐
│  Chats  Projects  Art.  │  ← Tab bar
├────────────────────────┤
│  🔍 Search             │
│  ⭐ Starred Chats      │
│  📂 Recents            │
│  ─────────────────────  │
│  Chat 1                │
│  Chat 2                │
│  ...                   │
├────────────────────────┤
│  👤 Profile    [+] New │  ← Bottom action bar
└────────────────────────┘
```

### 1.2 Desktop Layout (Responsive)

```
┌─────┬──────────────┬──────────────────────────┐
│ Nav │   Panel      │        Main Chat          │
│     │              │                           │
│ 📝  │ Chats list   │  Messages area            │
│ 📁  │              │                           │
│ ⚙️  │              │                           │
│     │              │                           │
│     │              │  ┌──────────────────────┐ │
│     │              │  │ + │ Model │ 🎤 │ ➤  │ │
│     │              │  └──────────────────────┘ │
└─────┴──────────────┴──────────────────────────┘
```

**Three-column structure:**
- **Column 1 (Sidebar):** Navigation icons — New Chat, Projects, Settings, Profile
- **Column 2 (Panel):** Chat list, search, filters, starred items
- **Column 3 (Main):** Active conversation area with input bar

---

## 2. Design Tokens

### 2.1 Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0d0f11` | Main background |
| `--bg-secondary` | `#1a1c1e` | Panel backgrounds, cards |
| `--bg-tertiary` | `#25262b` | Input fields, elevated surfaces |
| `--bg-hover` | `#2c2e33` | Hover states |
| `--accent-primary` | `#e8590c` | Primary buttons, active states, CTAs |
| `--accent-hover` | `#f76707` | Hover state for accent |
| `--text-primary` | `#e1e1e3` | Primary text |
| `--text-secondary` | `#909296` | Secondary text, labels |
| `--text-muted` | `#5c5f66` | Placeholder text, disabled |
| `--border-default` | `#2c2e33` | Borders, dividers |
| `--success` | `#40c057` | Online indicators, positive states |
| `--danger` | `#fa5252` | Delete, destructive actions |
| `--glass-bg` | `rgba(37,38,43,0.7)` | Artifact queue glass overlay |

### 2.2 Typography

| Style | Font | Weight | Size | Usage |
|-------|------|--------|------|-------|
| Heading 1 | Inter | 600 | 24px | Screen titles |
| Heading 2 | Inter | 600 | 18px | Section headers |
| Heading 3 | Inter | 500 | 15px | Subsection headers |
| Body | Inter | 400 | 14px | Messages, descriptions |
| Caption | Inter | 400 | 12px | Timestamps, metadata |
| Mono | Geist Mono | 400 | 13px | Code blocks, artifacts |

### 2.3 Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight spacing |
| `--space-sm` | 8px | Small gaps |
| `--space-md` | 12px | Component padding |
| `--space-lg` | 16px | Card padding, section gaps |
| `--space-xl` | 24px | Screen margins |
| `--space-2xl` | 32px | Large section separators |

### 2.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small buttons, chips |
| `--radius-md` | 10px | Cards, input fields |
| `--radius-lg` | 16px | Bottom sheets, modals |
| `--radius-full` | 9999px | Pills, avatars, FAB |

### 2.5 Shadows & Effects

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Cards, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Modals, overlays |
| `--blur-glass` | `blur(20px)` | Glass morphism effects |

---

## 3. Component Inventory

### 3.1 Top Bar

| Element | State | Description |
|---------|-------|-------------|
| Back arrow | Visible on sub-screens | Navigates up one level |
| Incognito icon | Toggle (on/off) | Enables private browsing mode |
| Menu hamburger | Desktop only | Opens slide-in panel |
| Profile avatar | Shows initial/face | Opens profile menu |

### 2.2 Bottom Input Bar

```
┌─────────────────────────────────────────────┐
│ [+] │ [Ava 4.5 Fast ▾] [context: 27k/200k] │ [🎤] │ [➤] │
└─────────────────────────────────────────────┘
```

**Components:**
| Element | Type | Behavior |
|---------|------|----------|
| Plus `[+]` | Icon button | Opens attachment/add menu (slide-up sheet) |
| Model selector pill | Button | Shows current model name, opens model picker dropdown |
| Context indicator | Text | Shows token usage (e.g., "27k/200k · 87%") — changes color as usage increases |
| Mic icon | Icon button | Activates voice input, shows recording state |
| Send button `[➤]` | Icon button | Sends message, shows loading spinner during generation |
| Text input | Textarea | Auto-expands, placeholder: "Type your message..." |

### 3.3 Model Selector Dropdown

```
┌──────────────────────────────────┐
│ Models                    [+] Add│
├──────────────────────────────────┤
│ ● Ava 4.5 Fast      [free]      │
│ ● Kiro 4.6 Pro       $0.24/M    │
│   Riva               $0.13/M    │
│   Astra              $0.15/M    │
│   Leta               $0.02/M    │
│   Ava 4              [free]      │
└──────────────────────────────────┘
```

- Green dot = available
- Price shown per model
- "+ Add" button opens model discovery overlay

### 3.4 Add Model Overlay

```
┌──────────────────────────────────┐
│        Add Models                │
├──────────────────────────────────┤
│ ┌─────────┐  ┌─────────┐        │
│ │ [card]   │  │ [card]   │        │
│ │ Kiro     │  │ Riva     │        │
│ │ [Add]    │  │ [Add]    │        │
│ └─────────┘  └─────────┘        │
│                                  │
│ [Show More Models...]            │
└──────────────────────────────────┘
```

Each model card: icon, name, brief description, "+ Add" button.

### 3.5 Attachment Menu (Bottom Sheet)

```
┌──────────────────────────────┐
│                              │
│    📷       🖼️       📄      │
│  Camera   Photo    File     │
│                              │
│  ──────────────────────────  │
│  Web Search: [toggle]        │
│                              │
│  ──────────────────────────  │
│  [Add to Project]            │
│                              │
└──────────────────────────────┘
```

### 3.6 Slide-In Panel (Left Side)

**Tab Navigation:**
| Tab | Icon | Content |
|-----|------|---------|
| Chats | 💬 | Chat list grouped by date |
| Projects | 📁 | Project folders |
| Artifacts | 📄 | Generated artifacts |

**Chat List Item:**
```
┌──────────────────────────────────┐
│ ⭐ Chat Title                   │
│    Last message preview...       │
│    2 hours ago                  │
└──────────────────────────────────┘
```

**Panel Bottom Bar:**
| Left | Right |
|------|-------|
| 👤 Profile icon | [+] New Chat button |

### 3.7 Settings Screen

**Sections:**

#### Profile
- Full Name input field
- Nickname input: "What do you want Ava to call you?"
- [Update] button (orange accent)

#### Custom Instructions
- Large textarea
- Placeholder: "Add any instructions or preferences here..."

#### Capabilities (Toggle List)
| Capability | Default |
|------------|---------|
| Web Search | ON |
| Artifacts | ON |
| Code Execution | ON |
| Memory | ON |

Each with an on/off toggle switch.

#### Connectors
- List of connected services
- [Add New Connector] button

#### Permissions
- Per-MCP tool permissions
- Reset and Apply All buttons

#### Billing
- Current Plan card (Free Plan with price)
- [Cancel Subscription] button

#### Danger Zone
- [Delete Account] button (red)

### 3.8 MCP Permissions Modal

```
┌──────────────────────────────────┐
│  Select Permissions              │
│  Choose how each MCP should      │
│  work with your projects         │
├──────────────────────────────────┤
│  MCP Name                        │
│  Tool Name                       │
│  ┌──────────────────────────┐   │
│  │ ○ Allow                  │   │
│  │ ○ Deny                   │   │
│  │ ○ Ask every time         │   │
│  └──────────────────────────┘   │
│                                  │
│  [Reset]            [Apply All]  │
└──────────────────────────────────┘
```

### 3.9 Artifact Viewer

```
┌──────────────────────────────────┐
│ [Code] [Render]    [↑][↓][PDF][🖨] │
├──────────────────────────────────┤
│                                  │
│  // Artifact content here        │
│  // Code or rendered output      │
│                                  │
│                                  │
├──────────────────────────────────┤
│  [Share & Remix]                 │
└──────────────────────────────────┘
```

**Top bar controls:**
- Code/Render toggle (tabs)
- Copy, Download, PDF, Print (icon buttons)

### 3.10 Artifact Floating Queue

When an artifact is generated, a floating glass overlay appears:

```
┌─────────────────────┐
│  📄 (2)              │  ← Glass pill with count badge
└─────────────────────┘
```

On expand, shows mini cards:
```
┌──────────────────────────────┐
│ Artifact 1          [↗]     │
│ Name | Date | Size    [A][R] │
├──────────────────────────────┤
│ Artifact 2          [↗]     │
│ Name | Date | Size    [A][R] │
└──────────────────────────────┘
```

- **A** = Approve
- **R** = Reject
- **Merge** (when applicable)
- **Rename** (pencil icon)

### 3.11 Share Dialog (Bottom Sheet)

```
┌──────────────────────────────┐
│  Share                        │
│  "Name"                       │
│                              │
│  Link Permissions             │
│  ○ Anyone                     │
│  ○ Invite-only                │
│  ○ Restricted                 │
│                              │
│  [Copy] [Download] [PDF]     │
│  [Print]                     │
│                              │
│  [X Close]                   │
└──────────────────────────────┘
```

### 3.12 Message Bubbles

**User Message:**
```
┌─────────────────────────────┐
│ User message text here      │  ← Right-aligned, accent bg
└─────────────────────────────┘
```

**Assistant Message:**
```
┌─────────────────────────────┐
│ 🤖 Assistant response       │  ← Left-aligned, secondary bg
│                             │
│ With markdown support,      │
│ code blocks, tables...      │
└─────────────────────────────┘
```

**Code Block (within message):**
```
┌──────────────────────────────────┐
│ language_name      [Copy] [Run] │
├──────────────────────────────────┤
│ // code here                     │
│ const x = 42;                    │
└──────────────────────────────────┘
```

### 3.13 Search & Filter Bar

```
┌──────────────────────────────┐
│ 🔍 Search chats...    [⚙️]  │
└──────────────────────────────┘
```

- Filter icon opens filter options (date range, model used, etc.)
- Select icon enables multi-select mode for bulk actions

### 3.14 Buttons & Actions

| Type | Style | Usage |
|------|-------|-------|
| Primary | Orange bg (#e8590c), white text | CTAs, Submit |
| Secondary | Transparent, border | Cancel, Back |
| Ghost | No bg, text only | Menu items, links |
| Icon | Circle/rounded, no text | Toolbar buttons |
| Destructive | Red bg (#fa5252) | Delete, Remove |
| Toggle | On/Off switch | Settings, capabilities |

### 3.15 Loading States

| State | Visual |
|-------|--------|
| Typing indicator | Three animated dots |
| Message generation | Streaming text with cursor |
| Model loading | Spinner in message area |
| Page load | Skeleton shimmer |

---

## 4. Screen-by-Screen Breakdown

### 4.1 Home Screen (Empty State)

**Shown when:** No active chat selected

**Elements:**
- Centered greeting text: "What's on your mind today?"
- Bottom input bar (always visible)
- Optional: Recent chat suggestions below greeting
- Top bar: Incognito toggle, menu hamburger

**Mobile:** Full-screen, no sidebar
**Desktop:** Three-column layout with empty main area

### 4.2 Active Chat Screen

**Elements:**
- Message list (scrollable, vertical)
- Bottom input bar
- Model indicator in input bar
- Context usage indicator
- Artifact floating queue (when artifacts exist)

**Message Flow:**
1. User sends message
2. Typing indicator appears
3. Assistant response streams in
4. Artifact generated → floating queue badge appears
5. User can interact with artifact inline or via queue

### 4.3 Settings Screen

**Navigation:** Accessible from profile icon → Settings

**Sections (scrollable):**
1. Profile (name, nickname)
2. Custom Instructions
3. Capabilities (toggles)
4. Connectors
5. MCP Permissions
6. Billing
7. Danger Zone (Delete Account)

### 4.4 Billing Screen

**Elements:**
- Current Plan card
  - Plan name (e.g., "Free Plan")
  - Price (if applicable)
  - Features included
- [Cancel Subscription] button
- Upgrade options (if applicable)

### 4.5 Model Management Screen

**Access:** Via model selector dropdown → "Add" button

**Elements:**
- Model cards in grid layout
- Each card: icon, name, description, price, [Add] button
- "Show More Models..." link
- Search/filter for models

### 4.6 Artifact Viewer Screen

**Access:** Via artifact in chat or floating queue

**Elements:**
- Code/Render toggle tabs
- Artifact content (code or rendered output)
- Action bar: Copy, Download, PDF, Print
- Share & Remix button
- Artifact metadata (title, date, size)

### 4.7 Share Dialog

**Access:** Via Share button on artifact

**Elements:**
- Title and description
- Link permission options (radio buttons)
- Action buttons: Copy, Download, PDF, Print
- Close button

---

## 5. Interaction Patterns

### 5.1 Navigation Patterns

| Pattern | Usage |
|---------|-------|
| Slide-in panel | Main navigation, chat list |
| Bottom sheet | Attachment menu, share dialog |
| Modal overlay | Settings, permissions, model selection |
| Push navigation | Sub-screens (billing, connectors) |
| Back gesture | Swipe right (mobile), back arrow |

### 5.2 Gesture Support (Mobile)

| Gesture | Action |
|---------|--------|
| Swipe right | Open panel / Go back |
| Swipe left | Close panel |
| Pull down | Refresh chat list |
| Long press | Context menu (copy, delete) |
| Double tap | Like/react to message |

### 5.3 State Transitions

```
Empty State → New Chat → Active Chat → Artifact Generated
                    ↓                    ↓
              Chat List ←───────────────┘
```

### 5.4 Error States

| Error | Display |
|-------|---------|
| Network error | Snackbar with retry button |
| Rate limit | "Too many requests" message |
| Model unavailable | Fallback model suggestion |
| Artifact generation failed | Error message with retry |

---

## 6. Mobile-First Priorities

### 6.1 P0 — Must Have for MVP

1. **Bottom input bar** — Core interaction, always visible
2. **Message list** — Scrollable, with user/assistant bubbles
3. **Model selector** — Dropdown with available models
4. **Send button** — With loading state
5. **Basic settings** — Profile, custom instructions
6. **Chat list** — Recent chats with search

### 6.2 P1 — Important for Launch

1. **Slide-in panel** — Full navigation with tabs
2. **Artifact viewer** — Code/render toggle
3. **Attachment menu** — Camera, photo, file
4. **Capabability toggles** — Web search, artifacts, etc.
5. **Context usage indicator** — Token count display
6. **Loading states** — Skeleton, streaming, typing indicator

### 6.3 P2 — Nice to Have

1. **Artifact floating queue** — Glass morphism overlay
2. **Share dialog** — Permissions, export options
3. **MCP permissions modal** — Per-tool permissions
4. **Model discovery** — Add model overlay
5. **Billing screen** — Plan details, cancel option
6. **Advanced gestures** — Swipe actions, long press menus

---

## 7. Key Screens to Build

### Priority Order

| # | Screen | Complexity | Notes |
|---|--------|------------|-------|
| 1 | Home (Empty State) | Low | Centered greeting + input bar |
| 2 | Active Chat | Medium | Messages, streaming, input |
| 3 | Slide-in Panel | Medium | Tabs, chat list, search |
| 4 | Settings | Medium | Profile, toggles, instructions |
| 5 | Model Selector | Low | Dropdown, model cards |
| 6 | Attachment Menu | Low | Bottom sheet, icons |
| 7 | Artifact Viewer | High | Code/render, actions |
| 8 | Share Dialog | Medium | Permissions, export |
| 9 | Billing | Low | Plan card, cancel |
| 10 | MCP Permissions | High | Per-tool toggles |

### Component Dependency Tree

```
Layout Shell
├── TopBar
│   ├── BackButton
│   ├── IncognitoToggle
│   └── MenuButton
├── SlideInPanel
│   ├── TabBar
│   ├── ChatList
│   │   └── ChatListItem
│   └── PanelBottomBar
├── MainContent
│   ├── EmptyState
│   ├── MessageList
│   │   ├── UserMessage
│   │   └── AssistantMessage
│   │       └── CodeBlock
│   └── ArtifactQueue
└── BottomInputBar
    ├── AttachmentButton
    ├── ModelSelector
    ├── ContextIndicator
    ├── MicButton
    ├── TextInput
    └── SendButton

Modals
├── SettingsModal
│   ├── ProfileSection
│   ├── CapabilitiesSection
│   ├── ConnectorsSection
│   └── BillingSection
├── ModelPickerModal
│   └── ModelCard
├── McpPermissionsModal
│   └── PermissionToggle
└── ShareDialog
    └── PermissionRadio

BottomSheets
├── AttachmentMenu
└── ShareOptions
```

---

## Appendix A: Screen Reference Map

| Screenshot | Screen | Key Elements |
|------------|--------|--------------|
| `1.jpg` | Desktop home | 3-column layout, empty chat |
| `2.jpg` | Desktop chat | Message list, input bar |
| `3.jpg` | Desktop settings | Full settings modal |
| `4.jpg` | Mobile home | Centered greeting, input |
| `5.jpg` | Mobile chat | Message bubbles, streaming |
| `6.jpg` | Slide-in panel | Chat list, tabs |
| `7.jpg` | Model selector | Dropdown with models |
| `8.jpg` | Settings profile | Name, nickname inputs |
| `9.jpg` | Capabilities | Toggle switches |
| `10.jpg` | Billing screen | Plan card, cancel |
| `11.jpg` | Artifact viewer | Code/render tabs |
| `12.jpg` | Share dialog | Permissions, export |
| `13.jpg` | MCP permissions | Tool permission toggles |
| `14.jpg` | Attachment menu | Camera, photo, file |
| `15.jpg` | Add model overlay | Model cards grid |
| `16.jpg` | Artifact queue | Glass overlay, cards |
| `17.jpg` | Context indicator | Token usage display |
| `18.jpg` | Search bar | Chat search, filters |
| `19.jpg` | Settings sections | Connectors, permissions |
| `20.jpg` | Empty state | Greeting message |
| `21.jpg` | Message details | Code block in message |
| `22.jpg` | Desktop panel | Sidebar navigation |
| `23.jpg` | Desktop settings | Settings layout |
| `24.jpg` | Mobile settings | Settings scroll |
| `25.jpg` | Mobile chat | Active conversation |
| `26.jpg` | Mobile panel | Panel overlay |

---

## Appendix B: Animation & Transition Specs

| Element | Transition | Duration | Easing |
|---------|-----------|----------|--------|
| Slide-in panel | translateX | 300ms | ease-out |
| Bottom sheet | translateY | 250ms | ease-out |
| Modal | fade + scale | 200ms | ease-in-out |
| Message appear | fade + slideUp | 150ms | ease-out |
| Typing dots | opacity pulse | 1.4s | ease-in-out |
| Skeleton shimmer | background position | 1.5s | linear |
| Artifact queue | scale + fade | 200ms | ease-out |

---

*End of UI Specification*
