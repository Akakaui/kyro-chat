# Kyro Chat — Security Audit Report

**Date:** July 20, 2026  
**Auditor:** Security Agent (Phase 4 — Code Development OS)  
**Scope:** `apps/api/src/` (backend API server)  
**Methodology:** Manual code review of all critical security surfaces: encryption, authentication, authorization, SQL injection, SSRF, sandbox isolation, browser sessions, email credentials, SSE streams, API key handling, and cross-tenant data access.

---

## Executive Summary

The Kyro Chat codebase demonstrates solid security fundamentals in several areas — authentication is properly enforced, SQL queries are consistently parameterized, and there is a conscious effort toward encryption of secrets. However, **six Critical-severity** and **eight High-severity** findings require immediate remediation before production deployment. The most pressing issues are: (1) multiple encryption subsystem conflicts that can render stored API keys permanently unrecoverable, (2) SSRF protection is not applied to the custom API tool execution path, (3) the VNC password is exposed in query strings, (4) email credentials stored as plaintext in the database, (5) missing cross-tenant scoping in several database queries, and (6) a raw Docker socket connection without namespace isolation.

---

## Findings

### 🔴 CRITICAL (Must Fix Before Production)

---

#### C-1: Dual Encryption Systems — API Keys at Risk of Permanent Data Loss

**Location:** `apps/api/src/routes/apikeys.ts:11-54` vs `apps/api/src/lib/encryption.ts:1-54` vs `apps/api/src/routes/mcp.ts:5`

**Description:** The codebase has **two completely independent encryption systems** that are incompatible:

| Subsystem | Used by | Algorithm | Key Source | Key Format |
|-----------|---------|-----------|------------|------------|
| `routes/apikeys.ts` (lines 38-54) | API key CRUD routes | AES-256-CBC | `ENCRYPTION_KEY` env var | Hex string → 256-bit Buffer |
| `lib/encryption.ts` (lines 6-52) | Connectors, MCP routes | AES-256-GCM | `API_KEY_ENCRYPTION_KEY` env var | String padded/truncated to 32 chars |

- **`connectors.ts` (lines 153, 294)** uses `encryptApiKey`/`decryptApiKey` from `lib/encryption.ts` (AES-GCM)
- **`mcp.ts` (lines 25, 32, 171, 174)** uses `encryptApiKey`/`decryptApiKey` from `lib/encryption.ts` (AES-GCM)
- **`apikeys.ts` (lines 66, 103)** uses its own internal `encrypt`/`decrypt` (AES-CBC)

If a user stores an API key through `/apikeys`, it's encrypted with `ENCRYPTION_KEY` (CBC). If someone later tries to read it through the connectors decrypt path (`lib/encryption.ts`), it will **fail silently** — producing garbled output, potentially exposing garbled key material to an LLM, or crashing.

**Impact:** Data corruption, permanent loss of stored API keys, garbled credentials sent to LLM providers.

**Fix:**
1. Standardize on ONE encryption system across the entire codebase. We recommend `lib/encryption.ts` (AES-256-GCM with Web Crypto API) because GCM provides authenticated encryption (tamper detection), whereas CBC does not.
2. Migrate `routes/apikeys.ts` to use `encryptApiKey`/`decryptApiKey` from `lib/encryption.ts`.
3. Document the key derivation strategy clearly: `API_KEY_ENCRYPTION_KEY` must be a 32-byte secret stored only in environment variables.
4. Add a key-rotation mechanism and a migration path for any existing CBC-encrypted keys.

---

#### C-2: No CBC Authentication Tag — Encrypted Data Subject to Tampering

**Location:** `apps/api/src/routes/apikeys.ts:38-54`

**Description:** The `encrypt`/`decrypt` functions in `apikeys.ts` use AES-256-CBC **without an HMAC or authentication tag**. CBC mode provides confidentiality but not integrity. An attacker who can modify the ciphertext in the database (e.g., via SQL injection, though that's mitigated elsewhere) could produce predictable changes in the decrypted plaintext.

The `lib/encryption.ts` (AES-256-GCM) implementation correctly includes authentication, but `apikeys.ts` does not.

**Impact:** Ciphertext tampering without detection. An attacker with database write access could corrupt API keys or potentially perform padding oracle attacks.

**Fix:** Migrate `apikeys.ts` to `encryptApiKey`/`decryptApiKey` from `lib/encryption.ts` (see C-1). If staying with CBC, prepend an HMAC-SHA256 over the ciphertext and validate it before decryption.

---

#### C-3: Encryption Key Derived from Variable-Length String via Padding

**Location:** `apps/api/src/lib/encryption.ts:12`

```typescript
const keyData = encoder.encode(cryptoKeyEnv.padEnd(32, '0').slice(0, 32));
```

**Description:** The encryption key is derived from `API_KEY_ENCRYPTION_KEY` by padding it to 32 characters with `'0'` (the character zero, ASCII 0x30) and slicing to the first 32 characters. This means:
- A 32-character key is used as-is
- A shorter key (e.g., 16 chars) gets padded with `'0'` characters, dramatically reducing entropy
- A longer key is silently truncated

A 32-character ASCII string has at most ~256 bits of entropy if truly random, but `padEnd(32, '0')` effectively creates a weak key if the input is shorter. For example, `"mysecret"` becomes `"mysecret0000000000000000000000000"` — only 8 characters of actual entropy.

**Impact:** Weak encryption keys if `API_KEY_ENCRYPTION_KEY` is short. Stored API keys and MCP tokens can be decrypted by an attacker who knows or guesses a short key.

**Fix:**
1. Require `API_KEY_ENCRYPTION_KEY` to be a 64-character hex string (256 bits) at startup — fail fast if it's not.
2. Use `Buffer.from(envKey, 'hex')` to derive exactly 32 bytes, matching the approach in `apikeys.ts:35`.
3. Reject keys shorter than 64 hex chars at startup in production.

---

#### C-4: SSRF Protection Bypass in Custom API Tool Execution

**Location:** `apps/api/src/tools/registry.ts:648-725` (function `registerCustomApiTools`)

**Description:** The `validateUrl` function in `connectors.ts` (lines 23-58) provides thorough SSRF protection — blocking private IPs, localhost, internal hostname suffixes, and raw IPv4 addresses. It is called when:
- Creating a connector (`POST /connectors`)
- Running endpoint discovery (`POST /connectors/:id/discover`)

**However**, the `registerCustomApiTools` function (registry.ts:672-683) constructs URLs for API tool execution **without calling `validateUrl`**:

```typescript
// registry.ts:683
const fullUrl = `${baseUrl?.replace(/\/+$/, '') || ''}${path}${queryString ? `?${queryString}` : ''}`;
```

The `fetch` call at line 698 uses this URL directly with no validation. The `baseUrl` comes from the database record, and path/query parameters come from LLM-generated tool arguments. An attacker who controls the LLM's output (or a malicious MCP server) could craft tool arguments that redirect requests to internal services.

**Impact:** SSRF — an attacker can make the server issue HTTP requests to internal infrastructure (metadata services, internal APIs, databases) by manipulating the `path` or `query` parameters of custom API tool calls.

**Fix:**
1. Import `validateUrl` from `connectors.ts` (or extract it to a shared module).
2. Call `validateUrl(fullUrl)` at `registry.ts:683` before executing the `fetch`.
3. Additionally, validate that resolved hostnames (for hostname-based URLs) resolve to public IPs by performing DNS lookup and checking against blocked IP patterns. This is already partially handled in `connectors.ts:47-56` for raw IP hostnames, but hostnames are only checked against suffixes, not resolved.

---

#### C-5: VNC Password Exposed in URL Query String

**Location:** `apps/api/src/browser/service.ts:52`

```typescript
return `http://${host}:${session.novncPort}/vnc.html?autoconnect=true&resize=scale&password=${session.password}`;
```

**Description:** The noVNC URL returned to the frontend (and potentially logged, cached in browser history, sent in Referer headers) contains the VNC password as a query parameter. The password is a 16-character hex string (randomBytes(8)) but:
- Query strings are logged by proxies, load balancers, and CDNs
- Browser history stores full URLs
- Referer headers leak the password when the noVNC page loads external resources
- Server access logs will record the password

**Impact:** VNC session hijacking. Anyone with access to logs, browser history, or network traces can take over a user's browser session, viewing all tabs and executing commands.

**Fix:**
1. Use the noVNC `path` parameter to pass the token: `vnc.html?autoconnect=true&resize=scale&path=websockify?token=${session.password}`
2. Or use a short-lived session token exchanged server-side rather than passing the password directly.
3. Configure the noVNC websockify proxy to accept the password only on the first connection and rotate it.
4. Set `Cache-Control: no-store` and use `Referrer-Policy: no-referrer` on the VNC page response.

---

#### C-6: Email Credentials Stored as Plaintext in Database

**Location:** `apps/api/src/routes/email.ts:54-58`

```typescript
db.prepare(`
  UPDATE user_profiles
  SET email_config = ?
  WHERE id = ?
`).run(JSON.stringify({ smtp, imap }), user.id);
```

**Description:** The full SMTP and IMAP configuration — including `smtp.password` (line 41), `imap.password` (line 47) — is serialized to JSON and stored **without encryption** in the `user_profiles.email_config` column. The `email/service.ts` file itself contains a security warning comment (lines 7-19) acknowledging this issue, but no mitigation is implemented.

**Impact:** Database compromise = email account compromise. An attacker with read access to the database can exfiltrate SMTP/IMAP credentials and send/receive email as the user's agent.

**Fix:**
1. Encrypt `email_config` using `encryptApiKey` from `lib/encryption.ts` before storing.
2. Decrypt only at point of use in `email/service.ts:initialize()`.
3. Never log the config object (already partially addressed via comments, but need explicit sanitization).
4. Consider implementing OAuth2 for Gmail/Outlook to avoid storing passwords entirely.

---

### 🟠 HIGH (Must Fix Within First Production Sprint)

---

#### H-1: Sub-Agent Query Missing Cross-Tenant Scoping

**Location:** `apps/api/src/agent/subagent.ts:18-20`

```typescript
const childAgent = db.prepare(`
  SELECT * FROM agents WHERE id = ?
`).get(childAgentId) as Agent | undefined;
```

**Description:** This query fetches an agent by ID **without checking `user_id`**. A user could delegate to another user's sub-agent by guessing or enumerating agent IDs. The sub-agent would execute with the other user's system prompt, KB permissions, and configuration.

Same issue at line 74-76 (`delegateStream`).

And in `tools/registry.ts:408`:
```typescript
const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
```

And in `tools/sandbox-tools.ts:396`:
```typescript
const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(targetAgentId) as any;
```

**Impact:** Cross-tenant agent execution. User A can make User B's agent perform arbitrary actions.

**Fix:** Add `AND user_id = ?` to all four queries with the current user's ID.

---

#### H-2: Knowledge Base Chunk Search Missing Cross-Tenant Scoping

**Location:** `apps/api/src/kb/vector.ts:49-53`

```typescript
const chunks = db.prepare(`
  SELECT id, content, embedding, metadata
  FROM kb_chunks
  WHERE kb_id = ?
`).all(kbId) as Array<{...}>;
```

**Description:** The `searchChunks` function queries KB chunks by `kb_id` only, without verifying `user_id`. This is called from `chat.ts:145` (`searchChunks(kb.kb_id, content, 3)`) and from `tools/registry.ts:563`. Both callers first check permissions or scope, but the vector search itself doesn't enforce it.

Additionally, `deleteChunks` at `vector.ts:85` only checks `kb_id` — no user scope.

And in `tools/registry.ts:627`:
```typescript
db.prepare('DELETE FROM kb_chunks WHERE kb_id = ? AND user_id = ?').run(kbId, ctx.userId || '');
```
This one DOES have `user_id` scoping — inconsistency.

**Impact:** Cross-tenant data access — User A can search or delete User B's knowledge base chunks if they know the KB ID.

**Fix:** Add `AND user_id = ?` to both `searchChunks` and `deleteChunks` in `vector.ts`, matching the pattern in `tools/registry.ts:627`.

---

#### H-3: Custom API `/discover` Endpoint Sends Unverified API Key to External Service

**Location:** `apps/api/src/routes/connectors.ts:276-316`

**Description:** The `/connectors/:id/discover` route decrypts the stored API key and sends it in HTTP headers (`Authorization: Bearer ${apiKey}`, `X-API-Key: ${apiKey}`) to the user-specified `base_url` during endpoint discovery (line 74-75). The `validateUrl` check happens (line 69), which mitigates SSRF, but the API key itself is sent to an untrusted external service.

If the external service is malicious, compromised, or logs request headers, the user's API key is exposed.

**Impact:** API key exfiltration to third-party services.

**Fix:**
1. Add a user-facing warning when connecting custom APIs: "Your API key will be sent to the external service during endpoint discovery."
2. Consider making discovery optional — let the user manually specify endpoints.
3. Mask the API key value from any error responses or logs if the external service returns an error.

---

#### H-4: MCP Server URL Not Validated Against SSRF

**Location:** `apps/api/src/routes/mcp.ts:10-74`

**Description:** The `/mcp/connect` endpoint accepts a `url` parameter and passes it directly to `StreamableHTTPClientTransport` (line 36). There is **no `validateUrl` call** on the MCP server URL. The MCP client connects to this URL using the provided API key or access token.

The `mcp/client.ts:36` creates a `new URL(server.url)` which will reject malformed URLs, but does not block private/internal IPs.

Additionally, the `test` endpoint (mcp.ts:156-198) reconnects to the stored URL with decrypted tokens — same issue.

**Impact:** SSRF — an attacker can connect the server to internal MCP services or infrastructure endpoints on private networks, potentially exfiltrating API keys and access tokens.

**Fix:**
1. Import `validateUrl` from `connectors.ts` and call it on the URL before connecting.
2. Apply the same SSRF validation to MCP connections as custom API connectors.

---

#### H-5: Browser Container Uses Hardcoded Port and Shared Docker Socket

**Location:** `apps/api/src/browser/service.ts:6, 235-236`

```typescript
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
// ...
const novncPort = 6901; // HARDCODED
```

**Description:**
- The Docker socket (`/var/run/docker.sock`) is used directly — any container escape or misconfiguration grants full host access.
- The noVNC port is hardcoded to `6901` (line 236), meaning only one browser session can exist at a time.
- The VNC port range (`5900 + Math.floor(Math.random() * 1000)`) has collision potential.
- Persistent volumes mount `/home/kasm-user:rw` from host filesystem (line 261), creating a host filesystem exposure vector if the container is compromised.
- No CPU/memory limits or seccomp/AppArmor profiles are specified beyond the Docker defaults.

**Impact:** Container breakout → host compromise. Port conflicts prevent concurrent users. Host filesystem exposed via persistent volumes.

**Fix:**
1. Use dynamic port allocation (port `0` and read the assigned port).
2. Add `SecurityOpt: ['no-new-privileges:true']` and `ReadonlyRootfs: true` where possible.
3. Consider using rootless Docker or Podman.
4. Add explicit resource limits: `NanoCpus`, `MemorySwap`.
5. Isolate persistent volumes per session with unique paths and size quotas.
6. Consider using E2B sandbox for browser sessions instead of raw Docker.

---

#### H-6: Conversation Messages Query Missing Cross-Tenant Scoping via Conversation Ownership

**Location:** `apps/api/src/routes/chat.ts:76-80`

```typescript
const messages = db.prepare(`
  SELECT * FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`).all(conversationId);
```

**Description:** While the conversation itself is verified with `user_id` at line 68-70, the messages query at line 76-78 does **not** join against `conversations` to verify ownership. If a user knows another user's conversation ID (UUIDs are hard to guess, but not impossible via enumeration in logs or shared links), they could read messages by skipping the conversation ownership check in a different code path.

Also in `chat.ts:110-114`, the history query only checks `conversation_id`:
```typescript
const history = db.prepare(`
  SELECT role, content FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`).all(conversationId) as Array<{ role: string; content: string }>;
```

The preceding check at line 94-100 validates conversation ownership, so the risk is mitigated for the direct API paths, but any internal code path that calls these queries without first checking conversation ownership could bypass tenant isolation.

**Impact:** Potential cross-tenant message access in internal code paths.

**Fix:** Add a composite query or join:
```sql
SELECT m.* FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE m.conversation_id = ? AND c.user_id = ?
```

---

#### H-7: Connector `getDecryptedApiKey` Has No Tenant Scoping

**Location:** `apps/api/src/routes/connectors.ts:348-359`

```typescript
export async function getDecryptedApiKey(connectorId: string): Promise<string | null> {
  const db = getDb();
  const row = db.prepare(`
    SELECT api_key_encrypted FROM custom_apis WHERE id = ?
  `).get(connectorId) as any;
```

**Description:** This exported helper function retrieves and decrypts an API key by connector ID **without checking user ownership**. Any internal code path that calls this function can obtain any user's decrypted API key.

**Impact:** API key exfiltration. Any caller with a connector ID can read the decrypted key.

**Fix:** Add `user_id` parameter and `AND user_id = ?` to the query:
```typescript
export async function getDecryptedApiKey(connectorId: string, userId: string): Promise<string | null> {
```

---

#### H-8: `browse_web` Tool Has No SSRF Protection

**Location:** `apps/api/src/tools/registry.ts:368-388`

```typescript
execute: async (args) => {
  const url = args.url as string;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'KyroBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });
```

**Description:** The `browse_web` tool (available to agents) fetches arbitrary URLs without any SSRF validation. An LLM-controlled agent can be instructed to fetch internal URLs like `http://169.254.169.254/latest/meta-data/` (AWS metadata service), `http://localhost:3001/health`, or internal network resources.

The `search_web` tool at line 354-366 is a stub ("Web search not yet configured"), but `browse_web` at line 368-388 is fully functional with no URL validation.

**Impact:** SSRF via LLM prompt injection. An attacker who can influence the agent's prompts can make the server fetch internal resources.

**Fix:**
1. Import `validateUrl` and call it on the `url` parameter before fetching.
2. Consider additional restrictions: block non-HTTP(S) schemes, limit redirects.

---

### 🟡 MEDIUM (Should Fix Before Scale)

---

#### M-1: Error Message Leakage — Stack Traces in Production

**Location:** `apps/api/src/index.ts:68-70`

```typescript
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});
```

**Description:** The global error handler returns a safe generic message, which is good. However, individual route handlers at `chat.ts:311` write raw error messages to the SSE stream:
```typescript
const errorMsg = `Error: ${err.message || 'Failed to get AI response'}`;
await streamWriter.write(errorMsg);
```

Additionally, `connectors.ts:314` returns:
```typescript
return c.json({ error: `Discovery failed: ${err.message}` }, 500);
```

And `mcp.ts:72`:
```typescript
return c.json({ error: `Failed to connect: ${err.message}` }, 502);
```

**Impact:** Internal error details (file paths, library internals, database errors) leaked to API consumers.

**Fix:** Log the full error server-side, return sanitized messages to clients. Use a consistent error wrapper function.

---

#### M-2: No CORS Wildcard but No CSP Headers

**Location:** `apps/api/src/index.ts:28-31`

```typescript
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
```

**Description:** CORS is configured correctly (single origin, not wildcard), but no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers are set. The SSE endpoints in `browser.ts` and `chat.ts` don't set any additional security headers.

**Impact:** Clickjacking (no X-Frame-Options), MIME sniffing attacks (no X-Content-Type-Options), MITM downgrade attacks on HTTP (no HSTS).

**Fix:** Add a security headers middleware:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss:;
```

---

#### M-3: User-Provided API Key in Chat Triggers External Validation

**Location:** `apps/api/src/routes/apikeys.ts:118-156`

**Description:** The `/apikeys/validate` endpoint accepts a user-provided API key and makes an outbound request to the provider's API to test validity. For Anthropic (line 124), it sends the key directly. For Google (line 148), it puts the key in the URL query string.

**Impact:**
- API keys are sent to external services, consuming quota and potentially logging usage
- Google API key appears in URL — logged everywhere
- No rate limiting on this endpoint — could be used to burn API quota

**Fix:**
1. Add rate limiting to the validate endpoint.
2. Use a minimal validation method (e.g., list models, not send messages).
3. For Google, use header-based auth instead of query string.
4. Consider local validation (format check) before remote validation.

---

#### M-4: Email Logs Store Full Email Content

**Location:** `apps/api/src/routes/email.ts:79-82` and `apps/api/src/db/init.ts:156-166`

```typescript
db.prepare(`
  INSERT INTO email_logs (id, user_id, to_address, subject, status)
  VALUES (?, ?, ?, ?, 'sent')
`).run(crypto.randomUUID(), user.id, to, subject);
```

**Description:** The `email_logs` table schema (`db/init.ts:156-166`) includes `body TEXT` column, and the `/send` endpoint logs the subject. The IMAP polling at `email/service.ts:309-345` processes full email bodies but they are not stored. The `email_logs` table currently only stores`to_address`, `subject`, and `status` — good. However, there's no data retention policy or automatic purging of logs.

**Impact:** Email subjects stored indefinitely. If `body` were ever populated, full email content would be stored in plaintext.

**Fix:**
1. Implement log retention policy (auto-delete after 30 days).
2. Encrypt the `body` field in `email_logs` if email content storage is ever implemented.
3. Add PII/data classification labels to the schema.

---

#### M-5: No Input Size Limits on Most Endpoints

**Location:** Multiple route files

**Description:** While `browser.ts` and `artifacts.ts` check for required fields, there are no maximum size limits on:
- `chat.ts` message `content` — could be arbitrarily large
- `apikeys.ts` `apiKey` — no length validation
- `connectors.ts` `baseUrl` — no length limit
- `mcp.ts` `url` — no length limit
- `email.ts` `text` body — no size check
- `sandbox.ts` `code` — no size check before sending to E2B
- `sandbox.ts` `command` — no size check before executing

**Impact:** Resource exhaustion (memory, database storage), large payload attacks.

**Fix:** Add maximum size validations:
- Chat message content: 100KB
- API key values: 10KB  
- URLs: 2KB
- Email body: 1MB
- Sandbox code/command: 1MB

---

#### M-6: Rate Limiting Only on Chat Endpoint

**Location:** `apps/api/src/middleware/limits.ts` and `apps/api/src/routes/chat.ts:86`

**Description:** Rate limiting (`chatRateLimit`) is only applied to `POST /chat/conversations/:id/messages` (line 86). Other sensitive endpoints like `/apikeys/validate`, `/email/send`, `/mcp/connect`, `/browser/start`, and `/sandbox/create` have no rate limiting. In-memory rate limiting also doesn't survive server restarts.

**Impact:** API abuse, quota exhaustion, resource DoS.

**Fix:**
1. Apply rate limiting to all resource-intensive endpoints.
2. Consider using a persistent store (Redis) for rate limit counters in production.

---

#### M-7: Socket Path Shell Injection Risk in Sandbox Commands

**Location:** `apps/api/src/tools/sandbox-tools.ts:48`

```typescript
const fullCmd = workdir ? `cd ${sanitizePath(workdir)} && ${command}` : command;
```

**Description:** The `workdir` parameter is sanitized via `sanitizePath` (blocks `..`), but the `command` parameter is passed directly to `executeCommand`. Shell metacharacters (`;`, `&&`, `||`, backticks, `$()`) are not stripped. Since commands run inside the E2B sandbox (not on the host), the impact is contained — but agent-generated commands could still perform destructive operations within the sandbox.

**Impact:** Sandbox filesystem damage, resource abuse within E2B instance.

**Fix:** This is acceptable risk given E2B isolation, but consider adding a dangerous-command blocklist (`rm -rf /`, `:(){ :|:& };:`, curl to internal IPs, etc.).

---

### 🟢 LOW (Improvements for Defense-in-Depth)

---

#### L-1: In-Memory Session State Not Persisted

**Location:** `apps/api/src/sandbox/service.ts:65`, `apps/api/src/browser/service.ts:41`

**Description:** Both sandbox and browser sessions are stored in `Map` objects in memory. If the server restarts, all active sessions are lost (though Docker containers and E2B sandboxes will still exist until their TTLs expire). There's no reconciliation on startup.

**Impact:** Orphaned resources after restart, inability to recover sessions.

**Fix:** Persist session IDs and container/sandbox IDs in the database (the `sandbox_sessions` table exists in `db/init.ts:116-125` but is not used). On startup, reconcile database records with actual resources.

---

#### L-2: No Audit Trail for Sensitive Operations

**Location:** Entire codebase

**Description:** There is no audit logging for:
- API key creation/deletion/decryption
- MCP server connections
- Sandbox session creation
- Browser session creation
- Email configuration changes

**Impact:** Incident investigation difficulty, compliance gaps.

**Fix:** Add an `audit_log` table and log all sensitive operations with user ID, timestamp, action, and resource ID.

---

#### L-3: `encryptApiKey`/`decryptApiKey` Not Timing-Safe

**Location:** `apps/api/src/lib/encryption.ts:6-52`

**Description:** The Web Crypto API's `decrypt` call may have timing variations based on whether the authentication tag matches. While Web Crypto is generally constant-time for the core AES operations, error paths (wrong key → garbled decryption → invalid UTF-8) could leak timing information.

**Impact:** Low — requires local access and precise timing measurements.

**Fix:** Acceptable for this use case. If higher assurance is needed, add a constant-time MAC comparison before decryption.

---

#### L-4: No Dependency Audit in CI/CD

**Location:** Project root (no evidence found)

**Description:** There is no `npm audit`, `yarn audit`, or Snyk/Dependabot configuration visible. The project uses `better-sqlite3`, `dockerode`, `nodemailer`, `imap-simple`, `e2b`, and `@modelcontextprotocol/sdk` — all of which have had security advisories.

**Impact:** Vulnerable dependencies may be deployed.

**Fix:** Add `npm audit` to CI/CD pipeline. Configure Dependabot or Renovate for automated updates.

---

#### L-5: `console.log` in Production Code

**Location:** Multiple files

- `routes/email.ts:135`: `console.log('New email:', email.subject)` — logs email subjects
- `routes/apikeys.ts:20-24`: `console.warn(...)` — appropriate for startup
- `routes/chat.ts:151`: `console.error(...)` — logs KB error but not sensitive
- `routes/chat.ts:176`: `console.warn(...)` — logs sandbox failure
- `email/service.ts:88,98,101`: `console.log/error` — sanitized, but still console

**Impact:** Email subjects in stdout/stderr. Log noise in production.

**Fix:** Replace `console.*` with structured logging (pino, winston). Never log email subjects, addresses, or content.

---

#### L-6: Artifact Share Hash Predictable

**Location:** `apps/api/src/artifacts/service.ts:275-278`

```typescript
const shareHash = createHash('sha256')
  .update(`${id}-${userId}-${Date.now()}`)
  .digest('hex')
  .slice(0, 12);
```

**Description:** Share hashes are SHA-256 truncated to 12 hex characters (48 bits). While sufficient for casual sharing, it's below the 128-bit recommendation for security-sensitive tokens. If `Date.now()` is predictable within a window, brute-force is feasible.

**Impact:** Low — share links are temporary and non-sensitive. Share hashes could be guessed.

**Fix:** Use `crypto.randomBytes(16).toString('hex')` for fully random 128-bit share tokens, or use full SHA-256 without truncation.

---

## Summary Table

| ID | Severity | Category | File(s) | Description |
|----|----------|----------|---------|-------------|
| C-1 | Critical | Encryption | `lib/encryption.ts`, `apikeys.ts`, `mcp.ts` | Two incompatible encryption systems (CBC vs GCM) |
| C-2 | Critical | Encryption | `apikeys.ts:38-54` | CBC without authentication tag |
| C-3 | Critical | Encryption | `lib/encryption.ts:12` | Weak key derivation via padding with '0' chars |
| C-4 | Critical | SSRF | `tools/registry.ts:683` | No SSRF validation on custom API tool calls |
| C-5 | Critical | Browser | `browser/service.ts:52` | VNC password in URL query string |
| C-6 | Critical | Email | `routes/email.ts:54-58` | Email credentials stored as plaintext in DB |
| H-1 | High | Cross-Tenant | `subagent.ts:18`, `registry.ts:408`, `sandbox-tools.ts:396` | Sub-agent queries missing user_id scoping |
| H-2 | High | Cross-Tenant | `kb/vector.ts:49,85` | KB chunk queries missing user_id scoping |
| H-3 | High | API Keys | `connectors.ts:74-75` | API key sent to untrusted external service during discovery |
| H-4 | High | SSRF | `mcp.ts:36` | MCP server URL not validated for SSRF |
| H-5 | High | Browser | `browser/service.ts:6,236` | Raw Docker socket, hardcoded port, host FS mount |
| H-6 | High | Cross-Tenant | `chat.ts:76,110` | Message queries join without user_id |
| H-7 | High | API Keys | `connectors.ts:348-359` | `getDecryptedApiKey` has no tenant scoping |
| H-8 | High | SSRF | `tools/registry.ts:375` | `browse_web` tool has no URL validation |
| M-1 | Medium | Error Handling | `chat.ts:311`, `connectors.ts:314`, `mcp.ts:72` | Error messages leak internal details |
| M-2 | Medium | Headers | `index.ts:28` | No CSP, HSTS, X-Frame-Options headers |
| M-3 | Medium | API Keys | `apikeys.ts:118-156` | API key validation sends keys externally without rate limit |
| M-4 | Medium | Email | `email.ts:79-82` | No log retention policy |
| M-5 | Medium | Input Validation | Multiple files | No max size limits on request bodies |
| M-6 | Medium | Rate Limiting | `limits.ts` | Rate limiting only on chat, in-memory only |
| M-7 | Medium | Sandbox | `sandbox-tools.ts:48` | Shell metacharacters not stripped (contained in E2B) |
| L-1 | Low | Session State | `sandbox/service.ts:65`, `browser/service.ts:41` | In-memory sessions lost on restart |
| L-2 | Low | Audit | Entire codebase | No audit logging for sensitive operations |
| L-3 | Low | Encryption | `lib/encryption.ts` | Non-timing-safe decryption (low practical risk) |
| L-4 | Low | Supply Chain | CI/CD | No dependency vulnerability scanning |
| L-5 | Low | Logging | Multiple files | `console.log` in production paths |
| L-6 | Low | Sharing | `artifacts/service.ts:275` | 48-bit truncated share hash |

---

## Implementation Plan for Security Hardening

### Phase 1 — Immediate (Before Production, ~3-5 days)

1. **Unified Encryption System** (C-1, C-2, C-3)
   - Extract `encryptApiKey`/`decryptApiKey` from `lib/encryption.ts` into a hardened shared module
   - Change `API_KEY_ENCRYPTION_KEY` to require 64-char hex, fail fast at startup
   - Use proper key derivation (`Buffer.from(envKey, 'hex')`) instead of string padding
   - Migrate `routes/apikeys.ts` to use the shared module
   - Write a migration script for any existing CBC-encrypted keys in the database

2. **SSRF Hardening** (C-4, H-4, H-8)
   - Extract `validateUrl` to `lib/validate-url.ts`
   - Add DNS resolution check for hostname-based URLs
   - Apply to: `browse_web` tool, custom API tool execution, MCP server connections

3. **VNC Password Fix** (C-5)
   - Change password delivery from query string to websocket path token
   - Add `Referrer-Policy: no-referrer` header
   - Set `Cache-Control: no-store` on VNC responses

4. **Email Credential Encryption** (C-6)
   - Encrypt `email_config` using `encryptApiKey` before storing in DB
   - Decrypt at point of use in `email/service.ts`
   - Sanitize all error messages that might reference credentials

### Phase 2 — Production Sprint 1 (~5-7 days)

5. **Cross-Tenant Query Hardening** (H-1, H-2, H-6, H-7)
   - Add `AND user_id = ?` to: subagent queries (×4), kb_chunks queries (×2), `getDecryptedApiKey`
   - Add join-based ownership check for message queries
   - Write integration tests that attempt cross-tenant access and verify failures

6. **Browser Container Security** (H-5)
   - Use dynamic port allocation
   - Add `SecurityOpt: ['no-new-privileges:true']`
   - Implement resource quotas per container
   - Evaluate E2B browser sandbox as alternative to raw Docker

7. **Security Headers** (M-2)
   - Create `middleware/security-headers.ts`
   - Add HSTS, X-Frame-Options, X-Content-Type-Options, CSP
   - Apply to all responses

8. **Error Sanitization** (M-1)
   - Create `lib/sanitize-error.ts` — logs full error, returns generic message
   - Apply to all route handlers and SSE streams

### Phase 3 — Production Sprint 2 (~3-5 days)

9. **Input Validation** (M-3, M-5)
   - Add Zod schemas for all request bodies with max lengths
   - Add rate limiting to all write endpoints
   - Migrate rate limit store to Redis for production

10. **Dependency Audit** (L-4)
    - Add `npm audit --production` to CI/CD
    - Review and update `dockerode`, `nodemailer`, `imap-simple` versions
    - Configure Dependabot

11. **Structured Logging** (L-5)
    - Replace `console.*` with `pino` logger
    - Configure log levels per environment
    - Add PII redaction to log pipeline

### Phase 4 — Ongoing

12. **Audit Trail** (L-2)
    - Create `audit_log` table
    - Log: API key operations, MCP connections, sandbox/browser sessions, email config changes

13. **Session Persistence** (L-1)
    - Persist sandbox/browser sessions to database
    - Implement startup reconciliation

14. **Share Token Hardening** (L-6)
    - Move to `crypto.randomBytes(16)` for share tokens

---

## Conclusion

The Kyro Chat backend demonstrates awareness of security concerns (documented warnings in `email/service.ts`, parameterized queries throughout, JWT validation on all protected routes). The critical findings center on **inconsistent encryption** (which can cause data loss), **incomplete SSRF protections** (three separate paths lack validation), and **credential exposure** (VNC password in URLs, email credentials in plaintext). These are structural issues that can be resolved systematically.

With the remediation plan above, the system can achieve production-ready security posture within 2-3 weeks of focused work.