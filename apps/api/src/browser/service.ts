import Docker from 'dockerode';
import { randomBytes, randomUUID } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { getDb } from '../db/init.js';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });

export interface Tab {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
}

interface BrowserSession {
  id: string;
  containerId: string;
  vncUrl: string;
  novncPort: number;
  vncPort: number;
  password: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  userId: string;
  persistent: boolean;
  createdAt: number;
}

interface HumanInputRequest {
  requestId: string;
  sessionId: string;
  prompt: string;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  createdAt: number;
}

const PERSISTENT_BASE = '/home/ubuntu/kyro-chat/data/browser-storage';

// ── C2: Command allowlist for executeCommand ──
const ALLOWED_COMMANDS = new Set([
  'curl', 'ls', 'cat', 'echo', 'which', 'pwd', 'uname', 'base64', 'grep',
]);
const MAX_COMMAND_LENGTH = 200;

// ── H1: VNC access tokens (short-lived, mapped to session) ──
const vncTokens = new Map<string, { sessionId: string; expiresAt: number }>();
const VNC_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

class BrowserService {
  private sessions: Map<string, BrowserSession> = new Map();
  private pendingInputs: Map<string, HumanInputRequest> = new Map();
  private sseClients: Map<string, Set<ReadableStreamDefaultController>> = new Map();

  /**
   * Get noVNC URL for embedding in iframe
   * Uses a short-lived random token instead of the raw VNC password.
   * The token is stored server-side and mapped back to the session.
   */
  getVncUrl(sessionId: string): { url: string; headers: Record<string, string> } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Generate a short-lived token instead of exposing the raw password
    const token = randomUUID();
    vncTokens.set(token, {
      sessionId,
      expiresAt: Date.now() + VNC_TOKEN_TTL_MS,
    });

    // Clean up expired tokens opportunistically
    for (const [key, entry] of vncTokens) {
      if (Date.now() > entry.expiresAt) vncTokens.delete(key);
    }

    const host = process.env.VPS_HOST || 'localhost';
    const url = `http://${host}:${session.novncPort}/vnc.html?autoconnect=true&resize=scale&path=websockify?token=${token}`;
    return {
      url,
      headers: {
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    };
  }

  /**
   * Resolve a VNC access token back to the session.
   * Returns null if the token is expired or unknown.
   */
  resolveVncToken(token: string): BrowserSession | null {
    const entry = vncTokens.get(token);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) vncTokens.delete(token);
      return null;
    }
    return this.sessions.get(entry.sessionId) || null;
  }

  /**
   * List open tabs in the browser session via CDP
   */
  async getTabs(sessionId: string): Promise<Tab[]> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const output = await this.executeCommand(
      sessionId,
      `curl -s http://localhost:9222/json/list`
    );

    try {
      const targets = JSON.parse(output);
      return targets
        .filter((t: any) => t.type === 'page')
        .map((t: any, i: number) => ({
          id: t.id,
          title: t.title || 'Untitled',
          url: t.url || '',
          favIconUrl: t.favIconUrl || '',
          active: i === 0,
        }));
    } catch {
      return [{ id: 'default', title: 'New Tab', url: 'about:blank', active: true }];
    }
  }

  /**
   * Switch to a specific tab via CDP
   */
  async switchTab(sessionId: string, tabId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    await this.executeCommand(
      sessionId,
      `curl -s -X PUT http://localhost:9222/json/activate/${tabId}`
    );
  }

  /**
   * Install a Chrome extension from a CRX URL.
   * Uses Node.js fetch() instead of shell curl to prevent command injection.
   * Validates that the URL is HTTPS and contains no shell metacharacters.
   */
  async installExtension(sessionId: string, extensionUrl: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // C3: Validate the URL is a strict HTTPS URL
    let parsed: URL;
    try {
      parsed = new URL(extensionUrl);
    } catch {
      throw new Error('Invalid extension URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Extension URL must use HTTPS');
    }
    // Reject URLs containing shell metacharacters
    if (/[;&|`$(){}!#<>?\\'"\n\r]/.test(extensionUrl)) {
      throw new Error('Extension URL contains invalid characters');
    }

    // Download the CRX file via Node.js fetch
    const response = await fetch(parsed.toString());
    if (!response.ok) {
      throw new Error(`Failed to download extension: HTTP ${response.status}`);
    }
    const crxBuffer = Buffer.from(await response.arrayBuffer());
    if (crxBuffer.length > 50 * 1024 * 1024) {
      throw new Error('Extension file too large (max 50 MB)');
    }

    // Upload the CRX into the container using Docker putArchive (tar stream)
    const container = docker.getContainer(session.containerId);

    // Build a minimal tar archive in memory
    const TAR_HEADER_SIZE = 512;
    const CRX_NAME = 'extension.crx';
    const nameBuffer = Buffer.from(CRX_NAME);
    const sizeBuffer = Buffer.from(crxBuffer.length.toString(8).padStart(11, '0'), 'utf8');
    const header = Buffer.alloc(TAR_HEADER_SIZE);
    nameBuffer.copy(header, 0);
    header[100] = 0; // null-terminated name
    // File mode (octal)
    Buffer.from('0000644\0', 'utf8').copy(header, 100);
    // Owner ID
    Buffer.from('0000000\0', 'utf8').copy(header, 108);
    // Group ID
    Buffer.from('0000000\0', 'utf8').copy(header, 116);
    // File size (octal, 12 bytes)
    sizeBuffer.copy(header, 124);
    header[124 + 11] = 0;
    // Modification time
    const mtime = Math.floor(Date.now() / 1000);
    Buffer.from(mtime.toString(8).padStart(11, '0'), 'utf8').copy(header, 136);
    header[136 + 11] = 0;
    // Checksum placeholder (all spaces)
    header.fill(' ', 148, 156);
    // Type flag: regular file
    header[156] = 0x30; // '0'
    // Compute checksum
    let chksum = 0;
    for (let i = 0; i < TAR_HEADER_SIZE; i++) chksum += header[i];
    Buffer.from(chksum.toString(8).padStart(6, '0'), 'utf8').copy(header, 148);
    header[154] = 0;
    header[155] = 0x20;

    // End-of-archive block
    const endBlock = Buffer.alloc(TAR_HEADER_SIZE, 0);

    const tarArchive = Buffer.concat([header, crxBuffer, endBlock]);
    await container.putArchive(Readable.from(tarArchive), { path: '/tmp' });

    // Unzip inside the container (safe — no user-controlled input in this command)
    await this.executeCommand(
      sessionId,
      `mkdir -p /tmp/ext && unzip -o /tmp/extension.crx -d /tmp/ext 2>/dev/null; echo done`
    );
  }

  /**
   * Capture screenshot as base64 for LLM context
   */
  async screenshotForLLM(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Use CDP to capture screenshot
    const output = await this.executeCommand(
      sessionId,
      `bash -c "DISPLAY=:1 import -window root /tmp/screenshot.png 2>/dev/null && base64 /tmp/screenshot.png | tr -d '\\n'"`
    );

    const base64 = output.trim();
    if (!base64) {
      throw new Error('Failed to capture screenshot');
    }

    return `data:image/png;base64,${base64}`;
  }

  /**
   * Agent pauses and waits for human input (e.g., sign-in screen)
   * Returns a Promise that resolves when the user provides input
   */
  waitForHumanInput(sessionId: string, prompt: string): Promise<string> {
    const requestId = randomBytes(16).toString('hex');

    return new Promise<string>((resolve, reject) => {
      const request: HumanInputRequest = {
        requestId,
        sessionId,
        prompt,
        resolve,
        reject,
        createdAt: Date.now(),
      };

      this.pendingInputs.set(requestId, request);

      // Send SSE event to connected frontend clients
      this.broadcastSSE(sessionId, {
        type: 'human_input_required',
        requestId,
        prompt,
      });

      // Auto-reject after 5 minutes
      setTimeout(() => {
        if (this.pendingInputs.has(requestId)) {
          this.pendingInputs.delete(requestId);
          reject(new Error('Human input timed out'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Submit human input to resolve a pending request
   */
  submitHumanInput(requestId: string, input: string): boolean {
    const request = this.pendingInputs.get(requestId);
    if (!request) return false;

    this.pendingInputs.delete(requestId);
    request.resolve(input);
    return true;
  }

  /**
   * Register an SSE client for a session
   */
  addSSEClient(sessionId: string, controller: ReadableStreamDefaultController): void {
    if (!this.sseClients.has(sessionId)) {
      this.sseClients.set(sessionId, new Set());
    }
    this.sseClients.get(sessionId)!.add(controller);
  }

  /**
   * Remove a specific SSE client controller
   */
  removeSSEClient(sessionId: string, controller?: ReadableStreamDefaultController): void {
    if (controller) {
      this.sseClients.get(sessionId)?.delete(controller);
    } else {
      // Remove all SSE clients for this session (cleanup on session end/abort)
      this.sseClients.delete(sessionId);
    }
  }

  /**
   * Broadcast an SSE event to all connected clients for a session
   */
  private broadcastSSE(sessionId: string, data: Record<string, any>): void {
    const clients = this.sseClients.get(sessionId);
    if (!clients) return;

    const encoded = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();

    for (const controller of clients) {
      try {
        controller.enqueue(encoder.encode(encoded));
      } catch {
        clients.delete(controller);
      }
    }
  }

  /**
   * Get Docker volume path for persistent mode
   */
  getPersistentVolumes(userId: string): string {
    const volumePath = join(PERSISTENT_BASE, userId);
    if (!existsSync(volumePath)) {
      mkdirSync(volumePath, { recursive: true });
    }
    return volumePath;
  }

  /**
   * Start a new browser session with noVNC
   */
  async startSession(userId: string, persistent: boolean = false): Promise<BrowserSession> {
    const sessionId = crypto.randomUUID();
    const vncPort = 5900 + Math.floor(Math.random() * 1000);
    const novncPort = 6901;
    const password = randomBytes(8).toString('hex');

    const env: string[] = [
      `VNC_PORT=${vncPort}`,
      `NOVNC_PORT=${novncPort}`,
      `KASM_PASSWORD=${password}`,
      'USER=root',
      'CHROME_START_ARGS=--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0',
    ];

    const hostConfig: any = {
      PortBindings: {
        [`${vncPort}/tcp`]: [{ HostPort: String(vncPort) }],
        [`${novncPort}/tcp`]: [{ HostPort: String(novncPort) }],
      },
      Memory: 1024 * 1024 * 1024, // 1GB limit
      CpuPeriod: 100000,
      CpuQuota: 75000, // 75% CPU
    };

    // Mount persistent volume if enabled
    if (persistent) {
      const volumePath = this.getPersistentVolumes(userId);
      hostConfig.Binds = [
        `${volumePath}:/home/kasm-user:rw`,
      ];
    }

    try {
      const container = await docker.createContainer({
        Image: 'kasmweb/chrome:1.15.0',
        Env: env,
        ExposedPorts: {
          [`${vncPort}/tcp`]: {},
          [`${novncPort}/tcp`]: {},
        },
        HostConfig: hostConfig,
        Labels: {
          'chatbot-saas': 'true',
          'session-id': sessionId,
          'user-id': userId,
          'persistent': String(persistent),
        },
      });

      await container.start();

      const session: BrowserSession = {
        id: sessionId,
        containerId: container.id,
        vncUrl: `vnc://localhost:${vncPort}`,
        novncPort,
        vncPort,
        password,
        status: 'running',
        userId,
        persistent,
        createdAt: Date.now(),
      };

      this.sessions.set(sessionId, session);

      // Save persistent sessions to database
      await this.saveSession(session);

      // Auto-cleanup after 1 hour (skip for persistent)
      if (!persistent) {
        setTimeout(() => {
          this.stopSession(sessionId).catch(() => {});
        }, 60 * 60 * 1000);
      }

      return session;
    } catch (error: any) {
      throw new Error(`Failed to start browser: ${error.message}`);
    }
  }

  /**
   * Stop a browser session
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopping';

    try {
      const container = docker.getContainer(session.containerId);
      await container.stop({ t: 5 });
      await container.remove();
    } catch (error) {
      // Container may already be removed
    }

    // Reject any pending human input requests
    for (const [requestId, request] of this.pendingInputs) {
      if (request.sessionId === sessionId) {
        this.pendingInputs.delete(requestId);
        request.reject(new Error('Session ended'));
      }
    }

    // Clean up SSE clients for this session
    this.sseClients.delete(sessionId);

    session.status = 'stopped';
    this.sessions.delete(sessionId);

    // Delete from database
    await this.deleteSession(sessionId);
  }

  /**
   * Get session
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions for a user
   */
  listSessions(userId: string): BrowserSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'running');
  }

  /**
   * Take a screenshot from the browser
   */
  async screenshot(sessionId: string): Promise<Buffer> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const container = docker.getContainer(session.containerId);
    const exec = await container.exec({
      Cmd: ['bash', '-c', 'DISPLAY=:1 import -window root /tmp/screenshot.png'],
      AttachStdout: true,
      AttachStderr: true,
    });

    await exec.start();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const stream = await container.getArchive({ path: '/tmp/screenshot.png' });
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Execute a command in the browser.
   * C2: Enforces a command allowlist and length limit for security.
   */
  async executeCommand(sessionId: string, command: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // C2: Command length limit
    if (command.length > MAX_COMMAND_LENGTH) {
      throw new Error(`Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters`);
    }

    // C2: Extract the base command (first token before any arguments)
    const baseCommand = command.trim().split(/\s+/)[0];
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      console.error(`[SECURITY] Blocked disallowed command: "${baseCommand}" by session ${sessionId}`);
      throw new Error(`Command "${baseCommand}" is not allowed. Allowed: ${Array.from(ALLOWED_COMMANDS).join(', ')}`);
    }

    // C2: Audit log — record every executed command
    console.info(`[AUDIT] executeCommand session=${sessionId} cmd="${command}"`);

    const container = docker.getContainer(session.containerId);
    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });

    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  async cleanupAll(): Promise<void> {
    const sessions = Array.from(this.sessions.keys());
    for (const sessionId of sessions) {
      await this.stopSession(sessionId);
    }
  }

  /**
   * Save a persistent session to the database
   */
  private async saveSession(session: BrowserSession): Promise<void> {
    if (!session.persistent) return;
    try {
      const db = getDb();
      await db.prepare(
        `INSERT INTO browser_sessions (id, user_id, container_id, vnc_port, novnc_port, password, persistent, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET container_id = ?, vnc_port = ?, novnc_port = ?, password = ?, status = ?`
      ).run(session.id, session.userId, session.containerId, session.vncPort, session.novncPort, session.password, 1, session.status, session.createdAt,
        session.containerId, session.vncPort, session.novncPort, session.password, session.status);
    } catch (err) {
      console.error('[BrowserService] Failed to save session to DB:', err);
    }
  }

  /**
   * Delete a session from the database
   */
  private async deleteSession(sessionId: string): Promise<void> {
    try {
      const db = getDb();
      await db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(sessionId);
    } catch (err) {
      console.error('[BrowserService] Failed to delete session from DB:', err);
    }
  }

  /**
   * Load persistent sessions from DB and re-attach to running containers
   */
  async loadPersistentSessions(): Promise<void> {
    try {
      const db = getDb();
      const rows = await db.prepare(
        `SELECT id, user_id, container_id, vnc_port, novnc_port, password, persistent, status, created_at
         FROM browser_sessions WHERE persistent = 1 AND status = 'running'`
      ).all();

      for (const row of rows as any[]) {
        try {
          // Verify the container is still running
          const container = docker.getContainer(row.container_id);
          const info = await container.inspect();
          if (info.State.Running) {
            const session: BrowserSession = {
              id: row.id,
              containerId: row.container_id,
              vncUrl: `vnc://localhost:${row.vnc_port}`,
              novncPort: row.novnc_port,
              vncPort: row.vnc_port,
              password: row.password,
              status: 'running',
              userId: row.user_id,
              persistent: true,
              createdAt: row.created_at,
            };
            this.sessions.set(session.id, session);
            console.info(`[BrowserService] Re-attached to persistent session ${session.id} for user ${session.userId}`);
          } else {
            // Container stopped externally — clean up DB
            await this.deleteSession(row.id);
          }
        } catch {
          // Container gone — clean up DB
          await this.deleteSession(row.id);
        }
      }

      const count = this.sessions.size;
      if (count > 0) {
        console.info(`[BrowserService] Loaded ${count} persistent session(s) from database`);
      }
    } catch (err) {
      console.error('[BrowserService] Failed to load persistent sessions:', err);
    }
  }
}

export const browserService = new BrowserService();
