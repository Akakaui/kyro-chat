# Kyro AI UI/UX Redesign — Implementation Plan (Spec v4)

**Scope Classification:** SaaS Web App — Major UI Overhaul (7 phases, ~13 component files)

---

## Phase 0 — Inception Summary

**Goal:** Modernize the Kyro chat UI to reduce visual noise, clarify model/agent selection, float artifacts without breaking chat flow, and bring mobile to native-app quality.

**Target Audience:** Existing Kyro web app users (desktop + mobile).

**Success Metrics:**
- Mobile nav is full-screen with thumb-friendly tab bar
- Artifacts can be viewed without losing chat context
- Model/agent selection is visible and persistent in the input area
- No dead/unused UI elements (fork/branch, Tool access, "Master Settings")

---

## Phase 1 — Detailed Plan

### Phase 1: Mobile Navigation & SlidePanel Redesign

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P0** | **L** | **High** |

**Objective:** Replace hamburger menu with a three-tab bottom navigation bar on mobile; redesign SlidePanel as a full-screen slide-over with three tabs (Chats / Projects / Artifacts); on desktop, keep the sidebar at 270px with the same three tabs.

#### Files to Modify

**`components/panels/SlidePanel.tsx`** — Full rewrite
- Remove hamburger trigger button (lines ~339-352)
- Remove the internal "Chats" / "Projects" toggle buttons (lines ~429-477)
- Add Radix `<Tabs>` root with three tabs: `Chats`, `Projects`, `Artifacts`
- **Mobile:** Full-screen overlay (`inset-0`), slide-in from left, z-50, close button top-right
- **Desktop:** Persistent 270px sidebar, `w-[270px]` fixed, always visible when `panelOpen`
- Move existing ChatsList content into `<Tabs.Content value="chats">`
- Move existing ProjectsPanel content into `<Tabs.Content value="projects">`
- Add new `<Tabs.Content value="artifacts">` that renders ArtifactPanel (filtered list, no right-drawer mode)
- Add `X` close button only on mobile

**`components/ui/tabs.tsx`** — Already exists (Radix Tabs), no changes needed

**`components/artifacts/ArtifactPanel.tsx`** — Add inline mode
- Add an optional `mode: "inline" | "drawer"` prop (default `"drawer"`)
- In `"inline"` mode: render the artifact list as a flat card list (no search header initially, simpler layout for the sidebar)
- In `"drawer"` mode: keep current right-drawer behavior

**`stores/chat.ts`** — Add new state
- `activeSlideTab: "chats" | "projects" | "artifacts"` — default `"chats"`
- `setActiveSlideTab: (tab) => void`
- `slidePanelMobile: boolean` — whether currently in mobile layout (computed from window width, or set by a resize listener)

**No new files needed.**

#### Dependencies
- None (first phase)

#### Risks
- Mobile full-screen overlay must not interfere with ChatInput positioning
- Transition animations (Framer Motion `AnimatePresence`) needed for smooth slide-in/out
- Desktop sidebar must push main content or overlay — **recommend overlay** to avoid layout reflow

---

### Phase 2: ChatInput Model/Agent Separation

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P0** | **M** | **Medium** |

**Objective:** Add a persistent model pill and agent pill to the ChatInput; remove the Tool access option from the attachment popover; update placeholder text per mode.

#### Files to Modify

**`components/chat/ChatInput.tsx`** — Major modification
- Add a new row above the textarea: `[Model Pill] [Agent Pill] [spacer] [Attach ⚎]`
- **Model Pill:** Small rounded button showing current model name (e.g., "Sonnet 4"). On click, opens the existing ModelSelector as a popover/dropdown positioned above the pill.
- **Agent Pill:** Small rounded button showing "Agent" (or agent name if selected). On click, opens a small dropdown listing available agents. When no agent selected, shows "Agent" in muted text. When selected, shows agent name with a colored dot.
- Remove the `Tool` option from the attachment popover (currently at lines ~369-384)
- Update placeholder text:
  - Act mode: `"Ask anything"`
  - Build mode: `"Describe what you want to build"`
- Keep the `[+] Attach ⎘` button on the left, but the model/agent pills sit between it and the textarea
- The pills should be **sticky** — visible even when textarea grows, sitting at the top of the input area

**`components/chat/ModelSelector.tsx`** — Refactor to popover
- Currently it's a full overlay (`modelSelectorOpen` state). Refactor to accept a `triggerRef` prop and render as a positioned popover above the trigger element
- Keep existing model list logic, group-by-provider, usage display
- Change from fullscreen overlay to a `position: absolute` popover relative to the model pill

**`stores/chat.ts`** — Add state
- `selectedAgent: Agent | null` — currently agents are only available via MentionPopup; add persistent selection
- `setSelectedAgent: (agent: Agent | null) => void`
- Existing `selectedModel` and `modelSelectorOpen` state already exists — reuse

#### Dependencies
- None (independent of Phase 1)

#### Risks
- ModelSelector refactor from overlay to popover may break existing keyboard/click-outside logic
- Agent pill needs to handle the case where an agent is also @mentioned in the message (the @mention should override for that single message)

---

### Phase 3: Floating Artifact Pill & Bottom Sheet

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P0** | **M** | **Medium** |

**Objective:** When artifacts are generated, show a floating glassmorphism pill at the bottom-center of the chat. Tapping it opens a bottom sheet with artifact details.

#### Files to Modify

**NEW `components/artifacts/ArtifactPill.tsx`** — New component
- Floating pill, `fixed` positioned at `bottom-24 left-1/2 -translate-x-1/2`
- Glassmorphism style: `backdrop-blur-xl bg-white/10 border border-white/20 rounded-full`
- Shows artifact name + count (e.g., "📊 3 artifacts")
- Animated entrance: `framer-motion` slide-up + fade-in
- Click handler: opens the ArtifactSheet
- Auto-hide when no artifacts exist or when chat is empty

**NEW `components/artifacts/ArtifactSheet.tsx`** — New component
- Uses existing `Sheet` component from `components/ui/sheet.tsx` with `side="bottom"`
- Content: list of artifacts with type icon, name, preview snippet
- Each artifact row clickable — opens ArtifactViewer (existing)
- Drag handle at top (standard Sheet pattern)
- Max height: ~60vh, scrollable via ScrollArea

**`components/chat/ChatView.tsx`** — Integration
- Import and render `<ArtifactPill />` inside the chat view, positioned below messages but above ChatInput
- Pass `artifacts` from store to the pill

**`components/artifacts/ArtifactViewer.tsx`** — Minor update
- Add an `onClose` prop so the bottom sheet can close when an artifact is opened in full viewer
- No other changes — existing viewer works fine

**`stores/chat.ts`** — Minor additions
- `artifactSheetOpen: boolean`
- `setArtifactSheetOpen: (open: boolean) => void`

#### Dependencies
- None (independent)

#### Risks
- Pill must not overlap with ChatInput on short viewports
- Bottom sheet must handle touch-drag dismiss gracefully on mobile
- Need to ensure artifacts are cleared when switching conversations

---

### Phase 4: ChatMessage & Message Timeline

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P0** | **M** | **Medium** |

**Objective:** Remove avatars, add model name label, add image carousel, limit message actions, add sub-agent thread expand/collapse.

#### Files to Modify

**`components/chat/ChatMessage.tsx`** — Major modification
- Remove avatar rendering (lines ~200-213 for the circular avatar with initials)
- Remove "Agent" label that appears next to avatars
- Add model name as a small muted label above the message content for assistant messages: `"Sonnet 4"` in `text-xs text-zinc-500`
- Add image carousel: if message has multiple images, render in a horizontal scroll with snap points
- Sub-agent thread: detect messages from sub-agents (by `agentName` or `parentId` field) and render them indented with a collapsible toggle
- Remove the top bar that shows "Assistant", "thinking", "web_search" status — move status to a more subtle indicator

**`components/chat/MessageActions.tsx`** — Simplify
- Remove `GitBranch` import and fork/branch action (line ~10)
- Keep only: `Copy`, `ThumbsUp`, `ThumbsDown`, `RotateCw` (Regenerate)
- Remove `Undo2` (Undo) action
- Ensure actions only appear on assistant messages (not user messages)
- Clean up the `useCallback` dependencies to remove unused `forkConversation`

**`components/chat/ImageMessage.tsx`** — Review
- Check if this component handles single images; may need updates for carousel behavior
- If the carousel is handled in ChatMessage, this may become a simple `<img>` wrapper

**`stores/chat.ts`** — Minor
- Add `expandedSubAgents: Set<string>` — tracks which sub-agent threads are expanded
- `toggleSubAgent: (messageId: string) => void`

#### Dependencies
- None (independent)

#### Risks
- Removing avatars is a significant visual change — ensure the model name label provides enough context
- Sub-agent thread detection depends on message metadata (`parentId` or `agentName`) — verify this exists in the `Message` type
- Image carousel needs to handle error states (broken image URLs)

---

### Phase 5: Sandbox & Artifacts Panel (Tabbed Right Drawer)

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P1** | **M** | **Medium** |

**Objective:** Redesign ArtifactPanel as a tabbed right-side drawer with four tabs (All / Code / Documents / Sandbox); add sandbox file browser with expiration display.

#### Files to Modify

**`components/artifacts/ArtifactPanel.tsx`** — Major rewrite
- Add Radix `<Tabs>` with four tabs: `All`, `Code`, `Documents`, `Sandbox`
- Each tab filters artifacts by type:
  - All: everything
  - Code: `html`, `react`, `mermaid` types
  - Documents: `markdown`, `pdf`, `csv` types
  - Sandbox: integrate `SandboxFileBrowser` component
- Add expiration banner at top of Sandbox tab: `"Sandbox expires in 15m"` with a countdown
- Keep search functionality (only on All/Code/Documents tabs, not Sandbox)
- Maintain the `mode` prop from Phase 1 (`"inline"` vs `"drawer"`)

**`components/sandbox/SandboxFileBrowser.tsx`** — Integration
- Currently a standalone overlay. Refactor to accept a `compact?: boolean` prop
- In compact mode: render file tree without the header/close button, designed to fit inside a tab panel
- Keep existing file tree logic, directory expansion, and file preview

**`stores/chat.ts`** — Minor
- `sandboxExpiration: number | null` — timestamp when sandbox expires
- `setSandboxExpiration: (ts: number | null) => void`

#### Dependencies
- Phase 1 (SlidePanel redesign provides the inline mode context)
- Phase 3 (ArtifactSheet for the mobile experience)

#### Risks
- Sandbox tab must gracefully handle "no sandbox active" state
- Expiration countdown needs a `setInterval` — ensure cleanup on unmount

---

### Phase 6: QuestionForm & Permission Updates

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P1** | **S** | **Low** |

**Objective:** Rename QuestionForm buttons from Allow/Deny to Submit/Dismiss; remove Tool access from attachment popover (done in Phase 2).

#### Files to Modify

**`components/chat/QuestionForm.tsx`** — Button text change
- Change "Allow" button text to "Submit" (lines ~169-170)
- Change "Deny" button text to "Dismiss" (lines ~179-180)
- Change button styles if needed (Submit = primary blue, Dismiss = muted/ghost)
- Verify `onSubmit` / `onDismiss` callbacks still work correctly

**Note:** Tool access removal is handled in Phase 2 (ChatInput.tsx).

#### Dependencies
- None (independent)

#### Risks
- Minimal — pure text/style change

---

### Phase 7: Settings Rename & Final Polish

| Priority | Effort | Complexity |
|----------|--------|------------|
| **P1** | **S** | **Low** |

**Objective:** Rename "Master Settings" to "Settings"; update BrowserOverlay to collapse-on-dismiss; add auto-switch model on sub-agent.

#### Files to Modify

**`components/panels/SettingsPanel.tsx`** — Text change
- Line 131: Change `"Master Settings"` → `"Settings"`
- No other changes needed

**`components/browser/BrowserOverlay.tsx`** — Behavior change
- Currently has `isExpanded` toggle. Change to: when the user closes/dismisses the overlay, set `isExpanded = false`
- When a new browser action is triggered (via store `browserEnabled` toggle or sub-agent request), re-expand
- Remove the manual toggle button if it exists; the overlay should only expand when actively in use

**`stores/chat.ts`** — Minor
- Verify `browserEnabled` / `toggleBrowserEnabled` logic works with the new collapse behavior
- Add `autoSwitchModel: boolean` — when true, auto-switch to a sub-agent's model when delegating (default: `true`)

#### Dependencies
- Phase 4 (BrowserOverlay may reference chat state changes)

#### Risks
- BrowserOverlay collapse behavior must not prevent the user from re-opening it manually
- Settings rename is trivial but must be tested in all contexts where the title appears

---

## Dependency Graph

```
Phase 1 (Mobile Nav / SlidePanel)
  └── Phase 5 (ArtifactPanel tabs — uses inline mode from Phase 1)

Phase 2 (ChatInput Model/Agent)
  └── (independent)

Phase 3 (Floating Pill / Bottom Sheet)
  └── (independent)

Phase 4 (ChatMessage / Timeline)
  └── (independent)

Phase 6 (QuestionForm buttons)
  └── (independent)

Phase 7 (Settings / BrowserOverlay)
  └── Phase 4 (optional — for browser state integration)
```

**Recommended execution order:**
1. Phase 1 + Phase 2 + Phase 3 (parallel — no dependencies between them)
2. Phase 4 + Phase 6 (parallel)
3. Phase 5 (depends on Phase 1)
4. Phase 7 (last — polish)

---

## New Files Summary

| File | Purpose |
|------|---------|
| `components/artifacts/ArtifactPill.tsx` | Floating glassmorphism pill for artifact count |
| `components/artifacts/ArtifactSheet.tsx` | Bottom sheet for artifact preview list |

---

## Modified Files Summary

| File | Phase | Change Type |
|------|-------|-------------|
| `components/panels/SlidePanel.tsx` | 1 | Full rewrite |
| `components/chat/ChatInput.tsx` | 2 | Major modification |
| `components/chat/ModelSelector.tsx` | 2 | Refactor to popover |
| `components/chat/ChatMessage.tsx` | 4 | Major modification |
| `components/chat/MessageActions.tsx` | 4 | Simplify (remove fork/undo) |
| `components/chat/QuestionForm.tsx` | 6 | Button text change |
| `components/artifacts/ArtifactPanel.tsx` | 1+5 | Add tabs + inline mode |
| `components/sandbox/SandboxFileBrowser.tsx` | 5 | Add compact mode |
| `components/panels/SettingsPanel.tsx` | 7 | Text rename |
| `components/browser/BrowserOverlay.tsx` | 7 | Behavior change |
| `components/chat/ChatView.tsx` | 3 | Integrate ArtifactPill |
| `stores/chat.ts` | 1-7 | Add new state fields |

---

## Effort Summary

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | L | Mobile Nav + SlidePanel redesign |
| Phase 2 | M | ChatInput model/agent pills |
| Phase 3 | M | Floating artifact pill + bottom sheet |
| Phase 4 | M | ChatMessage timeline cleanup |
| Phase 5 | M | Tabbed ArtifactPanel + Sandbox |
| Phase 6 | S | QuestionForm button rename |
| Phase 7 | S | Settings rename + BrowserOverlay |
| **Total** | **~2.5-3 weeks** | |

---

*Generated by shipkit-planner — Ready for review. Please approve before proceeding to Phase 2 (Build).*
