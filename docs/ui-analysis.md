# Chatbot SaaS App - UI Design Reference Analysis

> Comprehensive analysis of 47 screenshots across 3 AI chatbot/coding platforms for frontend design reference.

---

## 1. Apps Analyzed

| # | App | Platform | Screenshots |
|---|-----|----------|-------------|
| 1 | **Claude** (Anthropic) | Mobile (Android) | Folder 1, screenshots 1-13 |
| 2 | **OpenCode** | Web (Desktop browser) | Folder 1 (14-25) + Folder 2 (11-20) |
| 3 | **Antigravity** | Desktop (Electron) | Folder 2 (screenshots 1-10, 14-15) |

---

## 2. FOLDER 1 ANALYSIS — Claude Mobile App (Screenshots 1-13)

### 2.1 Overall Layout & Design Patterns

**Layout Structure:**
- Full-screen mobile layout with no persistent sidebar
- Single-column vertical flow
- Bottom-anchored input area (floating chat bar)
- Top header bar with back arrow (left) and action icon (right, e.g., incognito toggle)
- Centered greeting/logo in empty state

**Design Philosophy:**
- Minimalist, distraction-free interface
- Dark mode as default/primary theme
- Large whitespace (dark space) around the central logo on empty state
- The app prioritizes the chat input as the primary interaction

### 2.2 Color Scheme & Typography

| Element | Value |
|---------|-------|
| Background | `#1a1a1a` / `#212121` (very dark gray, near black) |
| Card/Surface | `#2d2d2d` / `#333333` (slightly lighter dark) |
| Primary Text | `#ffffff` / `#f5f5f5` (white) |
| Secondary Text | `#999999` / `#888888` (medium gray) |
| Accent/CTA | `#d4a574` (warm tan/copper for Claude logo) |
| Link Color | `#8b7bc6` (muted purple for "Upgrade to Pro") |
| Toggle Active | `#4a9eff` (blue toggle for Web search) |
| Danger/Logout | `#e07070` (muted red) |
| Button Fill (Primary) | `#333333` with `#ffffff` text |
| Font Family | Serif for brand name ("Claude"), Sans-serif for UI |

**Typography Hierarchy:**
- Brand name "Claude": Large serif font (~28px), elegant/academic feel
- Greeting ("Afternoon, Akaka"): Medium-large serif (~24px)
- Chat titles: Medium sans-serif (~16px), bold
- Metadata (timestamps): Small sans-serif (~13px), gray
- Input placeholder: Medium sans-serif (~16px), muted gray

### 2.3 Navigation Patterns

**Mobile Navigation (Claude):**
- **Hamburger menu** (top-left): Opens slide-out drawer from left
- **Drawer menu** contains:
  - App name "Claude" as header
  - Primary nav items: Chats, Projects, Artifacts (each with icon + label)
  - Divider
  - "Starred" section with pinned conversations
  - "Recents" section with chronological chat list
  - Bottom: User avatar circle (initials "AF") + "+ New chat" button (floating, bottom-right)

**Chat List Screen:**
- Top bar: Hamburger icon (left), filter icon + select icon (right)
- Large title "Chats" below top bar
- Search bar with magnifying glass icon
- List items: Title (bold) + relative timestamp (gray, smaller)
- Floating "+ New chat" button (bottom-right, pill-shaped, light background)

**Filter Dropdown:**
- Appears as floating card near the filter icon
- Options: "All chats" (with checkmark) and "Starred" (with star icon)
- Dark card background with subtle border

**Bulk Actions Mode:**
- Activated via select icon in top-right
- Checkboxes appear next to each chat item
- Top bar changes to show: back arrow, project icon, trash/delete icon
- Allows multi-select for batch operations

### 2.4 Chat Interface Design

**Empty State:**
- Centered Claude logo (animated asterisk/star icon in warm copper tone)
- Greeting text: "Afternoon, Akaka" (time-aware)
- Full dark background with generous spacing

**Chat Input Bar (Bottom-anchored):**
- Container: Rounded rectangle with dark gray background (`~#333`), subtle border
- **Upgrade banner**: "Get more with Claude Pro" with "Upgrade to Pro" link (purple) — sits above the input
- **Input field**: Single-line text input, placeholder "Chat with Claude..."
- **Bottom toolbar** within the input area:
  - Left: "+" button (attachment/add to chat)
  - Center: Model selector pill ("Sonnet 5 Thinking" — dark pill with white text)
  - Right: Microphone icon + Audio wave icon (voice input)
- Input bar has rounded corners and floats above the main content

**Add to Chat Sheet (Bottom Sheet):**
- Slides up from bottom with drag handle
- Title: "Add to chat" with X close button
- **Three media options** as large square buttons:
  - Camera (camera icon)
  - Photos (image icon)
  - Files (document icon)
- **Toggle option**: "Web search" with blue toggle switch
- **List options** with chevron arrows:
  - "Add to project" (shows current: None)
  - "Tool access" (shows current: Auto)

### 2.5 Incognito/Private Mode

- Triggered by ghost icon in top-right of chat screen
- Full-screen overlay: "Incognito chat"
- Ghost icon centered with explanatory text: "Incognito chats aren't saved or used to train models."
- "Learn more" link about data usage
- Same input bar at bottom
- X button (top-right) to exit incognito

### 2.6 Settings/Preferences Screen

**Settings Layout:**
- Header: Hamburger (left) + "Settings" title (center) + Info icon (right)
- Scrollable list of setting groups

**Setting Groups (top to bottom):**
1. **Account card**: Email address + plan badge ("Free" pill)
2. **Upgrade CTA card**: "Want more Claude?" with description + "Upgrade" button
3. **Account group** (rounded card):
   - Profile (person icon)
   - Billing (dollar icon)
4. **Features group** (rounded card):
   - Capabilities (sliders icon) — shows "4 enabled"
   - Connectors (grid icon) — shows "2 connected"
   - Permissions (shield icon)
5. **Appearance group** (rounded card):
   - Color mode (moon icon) — shows "Dark"
   - Font style (Aa icon) — shows "Default"
   - Voice (audio wave icon)
6. **Experience group** (rounded card):
   - Haptic feedback (vibration icon) — toggle switch
   - Privacy (lock icon)
   - Shared links (link icon)
7. **Danger zone**: Log out (red text, exit icon)

**Design Pattern:**
- Settings items are in rounded card groups with subtle borders
- Each item: icon (left) + label + optional value/chevron (right)
- Grouped logically with spacing between groups
- Toggle switches for on/off settings
- Chevron arrows (">") for navigation to sub-screens

### 2.7 Document Viewer (Artifact)

- Full-screen document viewer with X close (left) + document title (center) + three-dot menu (right)
- **Context menu** (three-dot): Publish, Copy, Download, Save as PDF, Share as PDF, Print — each with icon
- Document renders as formatted markdown/rich text
- Bottom: Reply input bar ("Reply to Claude...") with same controls as main chat
- Background: Slightly different shade than main chat (more neutral dark)

---

## 3. FOLDER 1 + 2 ANALYSIS — OpenCode Web App

### 3.1 Overall Layout (Desktop Web)

**Three-panel layout:**
- **Left sidebar** (~250px): Navigation + project tree + conversation list
- **Center panel** (fluid): Chat interface / main content
- **Right panel** (optional, ~350px): Code review / diff viewer / changes panel

**Alternative layout (Settings):**
- **Left sidebar**: Same navigation
- **Center-left panel**: Settings category list
- **Center-right panel**: Setting detail / edit form

### 3.2 Color Scheme & Typography

| Element | Value |
|---------|-------|
| Background (main) | `#1a1b1e` / `#0d0f11` (very dark, near black) |
| Sidebar | `#1e1f23` (slightly lighter dark) |
| Surface/Card | `#25262b` / `#2c2d31` |
| Border | `#373a40` (subtle dark gray) |
| Primary Text | `#c1c2c5` / `#e0e0e0` |
| Secondary Text | `#909296` / `#7c7f85` |
| Accent (Orange) | `#e8590c` / `#ff6b35` (used for agent names, action buttons) |
| Accent (Blue) | `#4dabf7` (for links, active states) |
| Accent (Green) | `#51cf66` (connected/success states) |
| Accent (Red) | `#ff6b6b` (danger, disconnect) |
| Code Background | `#1a1b1e` (monospace editor) |
| Font | System sans-serif (likely Inter or similar) |
| Code Font | Monospace (Geist Mono / JetBrains Mono) |

### 3.3 Navigation Structure

**Sidebar (Left):**
- **Top bar**: App icon + "tetnets" label + grid toggle icon
- **Icon row**: 6-7 small icon buttons (search, git, settings, etc.)
- **Collapsible sections**:
  - "recent" (expandable): Recent conversations with timestamps
  - Project folders (expandable tree): Shows project names with folder icons
  - Active conversation highlighted

**Main Navigation (accessible via hamburger or bottom bar):**
- New Conversation (+ button)
- Conversation History
- Scheduled Tasks
- Settings

### 3.4 Chat Interface Design (OpenCode Desktop)

**Empty State:**
- Large heading: "What are we working on in Ubuntu?" (contextual to project)
- Project selector dropdown (folder icon + project name)
- **Chat input area**:
  - Large text input with placeholder: "@ for files/agents; / for commands and skills; ! for shell; # for snippets"
  - **Bottom toolbar**:
    - Left: Plus icon (add), fullscreen icon, attachment icon
    - Right: Model selector ("Big Pickle" with icon), Agent selector ("Opex" with smiley), Microphone, Send button (play icon)
  - Below input: Quick action chips:
    - "Explore the codebase" (compass icon)
    - "Catch me up" (clock icon)
    - "Weigh my options" (balance icon)
    - "Start feature planning" (clipboard icon)
    - "Debug an issue" (bug icon)
    - "Review my changes" (magnifying glass icon)
    - "+" (add custom action)

**Active Conversation:**
- Messages displayed in a scrollable chat area
- User messages: Right-aligned or full-width with subtle background
- AI messages: Left-aligned with markdown rendering
- **Code blocks**: Syntax-highlighted with line numbers, dark background
- **File changes**: Expandable section showing "1 file changed +2 -2" with Review button
- **Collapsible work indicators**: "Worked for 2m ›" — expandable to show tool calls
- Action buttons on messages: Copy, thumbs up, thumbs down

**Code Review Panel (Right side):**
- Tabbed: "Review" | "For Turn"
- Shows file diff with syntax highlighting
- Red/green highlighting for deletions/additions
- Line numbers on both sides
- "+17 more lines" expandable sections
- File path breadcrumb at top

### 3.5 Model Selector Dropdown

**Design:**
- Dropdown from the model name in the input toolbar
- Search bar at top: "Search models"
- **Sections**:
  - "RECENT" (collapsible) — recently used models
  - Provider sections (e.g., "OPENCODE ZEN")
- Each model row: Provider icon + Model name + Context window size (e.g., "200K")
- Active model: Checkmark (✓) + Star (favorite) icon
- "Add new provider" link at top
- Keyboard hint: "↑↓ navigate  Tab switch agent"

### 3.6 Settings Architecture

**Settings Layout (3-column on desktop, modal on mobile):**
- Column 1: Category list with search
- Column 2: Category items list
- Column 3: Detail/edit form

**Settings Categories:**
1. Appearance (palette icon)
2. Chat (chat bubble icon)
3. Notifications (bell icon)
4. Sessions (clock icon)
5. Shortcuts (keyboard icon)
6. Git (branch icon)
7. Magic Prompts (sparkles icon)
8. Snippets (code icon)
9. Projects (folder icon)
10. Remote Instances (server icon)
11. Agents (smiley icon)
12. Behavior (gear icon)
13. Commands (terminal icon)
14. MCP (puzzle icon)
15. Plugins (grid icon)
16. Providers (cloud icon)
17. Usage (bar chart icon)
18. Skills (book icon)
19. Skills Catalog (catalog icon)
20. Voice (microphone icon)
21. Remote Tunnel (tunnel icon, "beta" badge)

### 3.7 Agent Configuration UI

**Agent List:**
- Project selector dropdown at top
- Count display: "Total 18" with "+" add button
- **Sections**: "BUILT-IN AGENTS" and "CUSTOM AGENTS"
- Each agent row:
  - Agent name (bold, monospace-ish)
  - Type badge: "system" (orange) or "user" (green/lock icon)
  - Description (truncated, gray text)
  - Three-dot menu (right)

**Agent Edit Form:**
- Header: Agent name + "Edit agent settings"
- **Identity & Role** section:
  - Description textarea
  - Mode selector: Pill buttons — "primary" | "subagent" | "all" (orange highlight for active)
- **Model & Parameters** section:
  - Override Model dropdown
  - Thinking Variant input
  - Temperature: Slider with +/- buttons, null display
  - Top P: Slider with +/- buttons
- **System Prompt**: Large textarea with monospace font
- **Tool Permissions** section:
  - "advanced editor" link
  - List of tools with permission badges:
    - "Allow" (green/olive badge)
    - "Ask" (orange badge)
    - "Deny" (red badge)
  - Each tool: Name + internal key + permission badge
  - Some show additional info: "Global: allow | Rules: 1 allow, 2 ask"
- "save changes" button (orange)

### 3.8 MCP Server Configuration

**Server List:**
- Project selector + count + add button
- Section: "USER SERVERS"
- Each server row:
  - Status dot (green = connected, red = disconnected)
  - Server name (bold)
  - Globe icon (for remote)
  - URL (gray, smaller)
  - Three-dot menu

**Server Edit Form:**
- Server name header + transport type badge ("Local · stdio transport") + "connect" button
- **Server section**:
  - Enable Server checkbox
  - Transport Mode: Pill toggle — "local · stdio" | "remote · sse"
- **Command section** (for local):
  - Command textarea (monospace)
  - "paste command" button
- **Server URL** (for remote):
  - URL input field
- **Advanced Remote Options** (collapsible):
  - Timeout (ms) input
  - Request Headers: Key/Value table with "add variable" and "paste headers"
- **OAuth section**:
  - Enable OAuth auto-detection checkbox
  - Client ID, Client Secret, Scopes, Redirect URI inputs
  - Callback URL display
- **Environment Variables**: "add environment variable" button
- Action buttons: "save changes" (orange) + "delete" (red)

### 3.9 Skills Management

**Skills List:**
- Project selector + count + add button
- Section: "PROJECT SKILLS"
- Each skill row:
  - Skill name (bold)
  - Tags: "project" badge + "agents" badge (both gray/muted)
  - Three-dot menu

**New Skill Form:**
- "New Skill" header + "Configure a new skill" subtitle
- **Basic Information**:
  - Skill Name input + Location dropdown ("User / OpenCode")
  - Description textarea (required, with helper text)
- **Instructions**: Code editor with line numbers (YAML frontmatter format)
- **Supporting Files**: "+ add file" button
- "create skill" button (orange)

### 3.10 Provider Configuration

**Provider List:**
- Project selector + count + add button
- Section: "USER PROVIDERS"
- Each provider: Icon + name + model count

**Provider Detail:**
- Provider name + type badge
- **Authentication** section: Connection status + "reconnect" button
- **Connection Details**: "No active configuration source" + "disconnect" link
- **Available Models** section:
  - Count badge + "hide all" / "show all" links
  - Filter models search bar
  - Model list: Name + context/output size + capability icons (star, eye, gear)

### 3.11 Plugins Management

**Plugin Install Modal:**
- Tabbed: "From npm" | "From local path" | "New file"
- Spec input: "npm-package@version or /absolute/path"
- Options (JSON) textarea
- Scope: Radio buttons — "User" | "Project"
- Action buttons: "cancel" + "add" (orange)

### 3.12 Scheduled Tasks

**Task List:**
- "Scheduled Tasks" header + "+ New" button
- Search bar
- Empty state: "No scheduled tasks configured."

**New Task Form (Modal):**
- Title: "New scheduled task"
- Subtitle: "Configure a server-side task that creates a new session and sends a prompt."
- **Fields**:
  - Task name input (e.g., "Daily Sync")
  - Times: Time picker (hour:minute AM/PM) + "+ add time" button
  - Timezone dropdown (e.g., "Africa/Lagos")
  - Model dropdown (with provider prefix)
  - Thinking level dropdown
  - Agent dropdown
  - Prompt textarea
  - Enabled checkbox
- Action buttons: "cancel" + "save" (orange)

### 3.13 Behavior Settings

**Global AGENTS.md**:
- Large textarea for system-wide AI behavior rules
- "save changes" button

**Response Style**:
- Checkbox: "Add response style instructions to new conversations"
- Style dropdown (e.g., "Concise")
- Preview/description textarea showing the style instructions

### 3.14 Project Settings

**Project List:**
- Count + add button
- Each project: Color dot + name

**Project Detail:**
- Project name input
- Path display
- **Accent Color**: Color picker grid (10 colors: blue, cyan, teal, purple, yellow, white, gray, red, orange, green)
- **Project Icon**: Icon grid selector (20+ icons) + "upload icon" / "discover favicon" buttons
- "save changes" button

**Actions section**:
- "Per-project commands shown in header next to project name."
- "+ add action" button
- "No actions configured yet."
- "save actions" button

---

## 4. FOLDER 2 ANALYSIS — Antigravity Desktop App

### 4.1 Overall Layout

**Desktop application (Electron-style):**
- **Menu bar**: "Antigravity  File  View  Window" (top)
- **Sidebar** (~260px, collapsible with Ctrl+B toggle)
- **Main content area** (fluid)
- **Optional right panel**: Code review / diff viewer
- **Top-right**: "Downloading Update" indicator + "Install IDE" button

### 4.2 Sidebar Navigation

**Structure (top to bottom):**
1. **Action buttons row**: Toggle sidebar, Back, Forward
2. **Primary actions**:
   - "+ New Conversation" (highlighted button)
   - "Conversation History" (with clock icon)
   - "Scheduled Tasks" (with clock icon)
3. **Pinned Conversations** section:
   - Truncated conversation title + relative timestamp
4. **Projects** section:
   - Filter icon + Add project icon
   - Folder tree with expand/collapse:
     - Project paths (e.g., "c:\Users\Owner\akaka-portf...")
     - Sub-conversations indented under projects
     - Active conversation: Blue dot indicator
5. **Conversations** section:
   - Chronological list with timestamps (9d, 19d, 1mo, etc.)
6. **Settings** (bottom, gear icon)

### 4.3 Chat Interface (Antigravity)

**Empty State:**
- Project path selector with dropdown
- Large input area with placeholder: "Ask anything, @ to mention, / for actions"
- **Input toolbar**:
  - Left: "+" (add), "Worktree" selector, Model dropdown ("Gemini 3.1 Pro (Low)")
  - Right: Microphone icon
- Below input: Worktree/Branch selector chips

**Active Conversation:**
- Header: Project name / Conversation title + three-dot menu + "Install IDE" button
- Messages in vertical scroll
- User messages: Slightly different background
- AI responses: Markdown rendered with code blocks
- **Code diff view** (right panel):
  - Tabs: "Overview" | "Review"
  - File name + path
  - Line-by-line diff with red/green highlighting
  - Expandable sections ("+17 more lines")
- **Work indicators**: "Worked for 2m ›" expandable
- **File change cards**: "1 file changed +2 -2" with Review button + file path
- Action buttons: Copy, thumbs up, thumbs down

### 4.4 Conversation History

- Full-page view with search bar + filter button
- Section header: "ALL CONVERSATIONS"
- Each conversation row:
  - Title (bold)
  - Project path or "Outside of Project" (gray)
  - Active indicator (blue dot) for currently open conversation
  - Relative timestamp (right-aligned)

### 4.5 Settings (Antigravity Modal)

**Modal dialog** overlaying the main interface:
- Back arrow + "Settings" title + X close
- Search bar
- Vertical list of settings categories (same as OpenCode web):
  - Appearance, Chat, Notifications, Sessions, Shortcuts, Git, Magic Prompts, Snippets, Projects, Remote Instances, Agents, Behavior, Commands, MCP, Plugins, Providers, Usage, Skills, Skills Catalog, Voice, Remote Tunnel (beta)
- Selected category highlighted
- Bottom: "Reload OpenCode" link

### 4.6 Scheduled Tasks (Desktop)

**List view:**
- "Scheduled Tasks" header + "+ New" button
- Search bar
- Empty state: "No scheduled tasks configured."

**New Task Modal:**
- Name input
- Project dropdown
- Schedule: Frequency dropdown ("Daily") + Time dropdown ("9:00 AM")
- Prompt textarea
- Info text: "All scheduled tasks run as Flash."
- "Add Scheduled Task" button

---

## 5. CROSS-PLATFORM DESIGN PATTERNS

### 5.1 Common Navigation Patterns

| Pattern | Claude Mobile | OpenCode Web | Antigravity Desktop |
|---------|--------------|--------------|---------------------|
| Primary Nav | Slide-out drawer | Persistent sidebar | Persistent sidebar |
| New Chat | FAB button (bottom-right) | Input area (centered) | "+ New Conversation" button |
| Search | Search bar in chat list | Search bar in settings | Search bar in history |
| Settings | Full-screen list page | 3-column modal/page | Modal dialog |
| Back Navigation | Arrow (top-left) | Sidebar click | Back arrow in modal |

### 5.2 Chat Input Patterns

| Feature | Claude | OpenCode | Antigravity |
|---------|--------|----------|-------------|
| Input Position | Bottom (floating) | Center (empty state) | Center (empty state) |
| Input Style | Rounded card | Rounded textarea | Rounded textarea |
| Model Selector | Pill in toolbar | Dropdown in toolbar | Dropdown in toolbar |
| Agent Selector | None (auto) | Dropdown in toolbar | None (auto) |
| Quick Actions | None | Action chips below input | None |
| Attachments | "+" bottom sheet | "+" button in toolbar | "+" button in toolbar |
| Voice Input | Microphone icon | Microphone icon | Microphone icon |
| Send Button | None (enter key) | Play icon (right) | Enter key |
| Syntax Hints | None | "@ for files; / for commands" | "@ to mention; / for actions" |

### 5.3 Settings Architecture Patterns

| Pattern | Claude | OpenCode | Antigravity |
|---------|--------|----------|-------------|
| Layout | Single-column list | 3-column (category > items > detail) | Modal with category list |
| Search | None | Search bar at top | Search bar at top |
| Grouping | Visual card groups | Sidebar category list | Flat list |
| Toggle Settings | Inline toggle switches | Checkbox in detail form | Checkbox in detail form |
| Navigation Settings | Chevron arrows | Category selection | Category selection |

### 5.4 Visual Design Language

**Consistent Across All Three:**
- **Dark mode** as primary/only theme
- **Rounded corners** on cards, inputs, buttons (8-12px radius)
- **Subtle borders** (1px, dark gray) for card separation
- **Icon + Label** pattern for navigation items
- **Badge system** for status indicators (colored pills)
- **Relative timestamps** ("6 minutes ago", "2 days ago", "1mo")
- **Truncation** with ellipsis for long text
- **Monospace font** for code, agent names, skill names
- **Sans-serif** for UI text
- **Serif font** only for Claude brand name

**Color Coding System (OpenCode/Antigravity):**
- Orange: Primary actions, active agents, important labels
- Green: Connected states, success, "user" badges
- Red: Disconnected, danger, deletions
- Blue: Links, active navigation, info
- Gray: Secondary text, inactive states, metadata

**Badge/Tag System:**
- Rounded pill shape
- Small text (~11-12px)
- Color-coded by type:
  - "system" = orange background
  - "user" = green/lock background
  - "project" = gray background
  - "agents" = gray background
  - "beta" = orange text badge

---

## 6. KEY UI COMPONENTS INVENTORY

### 6.1 Buttons
- **Primary CTA**: Filled (dark bg, white text) or Orange accent
- **Secondary**: Outlined or ghost style
- **Icon buttons**: Small, circular or square, subtle background
- **FAB (Floating Action Button)**: Bottom-right, pill-shaped, light background
- **Pill buttons**: Model/mode selectors, inline toggles

### 6.2 Input Components
- **Text input**: Rounded, dark background, subtle border
- **Textarea**: Multi-line, same styling, auto-resize
- **Search bar**: Magnifying glass icon + placeholder
- **Dropdown**: Custom styled, dark background, chevron indicator
- **Toggle switch**: iOS-style toggle (blue when active)
- **Checkbox**: Custom styled with accent color
- **Radio buttons**: For exclusive selections
- **Slider**: For numeric ranges (temperature, top P)
- **Time picker**: Dropdown-style (hour:minute AM/PM)

### 6.3 Card Components
- **Chat list item**: Title + metadata, no border, subtle hover
- **Settings group card**: Rounded container with multiple items inside
- **Agent/Skill card**: Name + badges + description + menu
- **Server card**: Status dot + name + URL + menu
- **File change card**: File path + change stats + review button
- **Upgrade CTA card**: Description + action button

### 6.4 Modal/Overlay Components
- **Bottom sheet** (mobile): Slide-up with drag handle
- **Full-screen modal** (mobile): Settings, document viewer
- **Center modal** (desktop): Settings, new task, plugin install
- **Dropdown menu**: Floating card with options
- **Context menu** (three-dot): Action list for items

### 6.5 Status Indicators
- **Online/offline dots**: Green/red circles
- **Active indicator**: Blue dot for current item
- **Badge counts**: Numbers in parentheses
- **Loading states**: Spinner, progress percentage (60.2%)
- **Update indicator**: "Downloading Update" text with spinner

### 6.6 Empty States
- **Centered icon + message**: "No scheduled tasks configured."
- **Greeting screen**: Logo + time-aware greeting + input area
- **Onboarding**: "What are we working on in [Project]?"

---

## 7. RESPONSIVE/MOBILE-FIRST PATTERNS

### 7.1 Mobile (Claude)
- Single column, full-width
- Bottom sheet for extended options
- Floating action buttons
- Swipe gestures implied (drawer menu)
- Large touch targets (44px minimum)
- Thumb-friendly bottom navigation area

### 7.2 Desktop (OpenCode/Antigravity)
- Multi-panel layout
- Sidebar navigation
- Keyboard shortcuts (Ctrl+B for sidebar toggle)
- Hover states on interactive elements
- Right-click context menus
- Modal overlays for settings
- Split-pane code review

### 7.3 Adaptation Strategy
- **Mobile**: Collapse sidebar to hamburger menu, stack panels vertically
- **Tablet**: Consider collapsible sidebar with overlay
- **Desktop**: Full sidebar + multi-panel layout
- **Input area**: Always bottom-anchored, expandable on mobile

---

## 8. RECOMMENDATIONS FOR CHATBOT SAAS FRONTEND

### 8.1 Must-Have Components
1. **Chat input bar** with model/agent selector, attachment button, voice input
2. **Message bubbles** with markdown rendering, code highlighting, action buttons
3. **Sidebar navigation** with project tree, conversation list, search
4. **Settings modal/page** with categorized sections
5. **Model/provider selector** dropdown with search and favorites
6. **Agent configuration** form with permissions system
7. **Quick action chips** for common tasks
8. **Empty state** with contextual greeting and onboarding

### 8.2 Nice-to-Have Components
1. **Code diff viewer** for file changes
2. **Scheduled tasks** management
3. **Plugin/MCP server** configuration
4. **Skills marketplace** catalog
5. **Incognito/private mode**
6. **Bulk conversation management** (select, delete, move)
7. **Document/artifact viewer** with export options

### 8.3 Design System Tokens
```
Colors:
  --bg-primary: #0d0f11
  --bg-secondary: #1a1b1e
  --bg-surface: #25262b
  --bg-elevated: #2c2d31
  --border-default: #373a40
  --text-primary: #c1c2c5
  --text-secondary: #909296
  --accent-primary: #e8590c (orange)
  --accent-success: #51cf66 (green)
  --accent-danger: #ff6b6b (red)
  --accent-info: #4dabf7 (blue)

Typography:
  --font-sans: 'Inter', system-ui, sans-serif
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace
  --font-serif: 'Georgia', serif (brand only)
  
Spacing:
  --radius-sm: 6px
  --radius-md: 8px
  --radius-lg: 12px
  --radius-xl: 16px
  --radius-pill: 9999px

Shadows:
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3)
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4)
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5)
```

### 8.4 Interaction Patterns to Implement
1. **Slash commands** (/) for quick actions
2. **@ mentions** for files, agents, people
3. **! shell** for terminal commands
4. **# snippets** for code templates
5. **Drag-and-drop** file attachments
6. **Keyboard shortcuts** for power users
7. **Context menus** (right-click / long-press)
8. **Undo/redo** for message editing
9. **Streaming responses** with typing indicator
10. **Expandable work indicators** showing AI thought process

---

## 9. FILE STRUCTURE REFERENCE

```
screenshots-analyzed/
├── Folder 1 (ui screenshot/)     # 25 JPGs
│   ├── Claude Mobile App (1-13)
│   │   ├── Empty state + greeting
│   │   ├── Incognito mode
│   │   ├── Add to chat bottom sheet
│   │   ├── Navigation drawer
│   │   ├── Chat list with search
│   │   ├── Filter dropdown
│   │   ├── Bulk selection mode
│   │   ├── Settings (2 pages)
│   │   └── Document viewer
│   └── OpenCode Web (14-25)
│       ├── Settings menu
│       ├── Provider configuration
│       ├── Agent list + edit
│       ├── Tool permissions
│       ├── MCP server config
│       ├── Skills list + create
│       ├── Airtable tool permissions
│       └── Document viewer (markdown)
│
└── Folder 2 (ui screensgot/)     # 22 PNGs
    ├── Antigravity Desktop (1-10, 14-15)
    │   ├── Main chat interface
    │   ├── Conversation history
    │   ├── Scheduled tasks
    │   ├── Code review panel (2 views)
    │   ├── New conversation
    │   └── Branch selector
    └── OpenCode Web (11-13, 16-20)
        ├── Empty state (centered)
        ├── Model selector dropdown
        ├── Projects settings
        ├── Agents settings (2 views)
        ├── Behavior settings
        ├── MCP servers (2 views)
        ├── Plugins modal
        ├── Providers detail
        ├── Skills list + create
        └── Scheduled task modal
```

---

*Analysis completed: July 18, 2026*
*Screenshots analyzed: 47 total across 3 platforms*
*Purpose: Chatbot SaaS frontend design reference*
