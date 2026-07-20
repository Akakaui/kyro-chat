# Kyro Chat — Major Refactor Brief

## Goal

Refactor Kyro Chat's UX and backend across 7 work buckets to deliver a cleaner, more permission-aware, skill-driven, artifact-rich agent chat experience. The refactor eliminates dead code, overhauls the permission system to 3-button simplicity, makes `/` commands skill-only, introduces a dynamic `@` mention system, adds proper knowledge base management with agent-level permissions, builds a full artifacts system with sharing, and enhances the sandbox file browser.

## Target Audience

- **Primary:** Developers and power users who use Kyro Chat daily for agent-assisted coding, research, and content creation
- **Secondary:** Teams who share agents, knowledge bases, and artifacts across projects

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Permission prompt friction | 2 buttons + checkbox (confusing) | 3 clear buttons (Allow Once / Always / Deny) |
| Slash command discoverability | 12 hardcoded static commands | Dynamic skill list from API |
| Mention system flexibility | Hardcoded agent/KB/artifact lists | Dynamic from store + API |
| KB management | No UI, manual DB only | Full settings panel with agent assignment |
| Artifact UX | No sharing, no viewer | Floating pill → slide panel → share/download/PDF |
| Sandbox file access | Hidden, broken `/api/sandbox/*` calls | Proper Hono API + tree view + 3-dot menu |
| Dead code | ~15 unused files/patterns | Zero |

## Constraints

- **Database:** SQLite (no migrations framework, use ALTER TABLE)
- **Backend:** Hono API, E2B sandbox, AI SDK (Vercel)
- **Frontend:** Next.js 15, zustand stores, Tailwind CSS
- **MCP:** Remote only (no local), StreamableHTTP transport
- **Auth:** Existing MCP token system (`mcp_tokens` table), no new auth needed
- **Deployment:** Single-server, no k8s/lambda

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Permission system regression breaks security | High | Medium | Comprehensive unit tests for resolution order; test each layer independently |
| KB migration breaks existing chunks | Medium | Low | Use ALTER TABLE ADD COLUMN (safe in SQLite); backfill with defaults |
| Artifact system scope creep | Medium | Medium | Build incrementally: pill → panel → viewer → share (each independently shippable) |
| Dead code deletion breaks hidden dependency | Low | Low | Full build + import grep after each deletion batch |
| Sandbox file tree performance with large projects | Low | Medium | Lazy-load directories, paginate, debounce file listings |
