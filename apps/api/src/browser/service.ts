import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface BrowserSession {
  id: string;
  containerId: string;
  vncUrl: string;
  websocketUrl: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  userId: string;
  createdAt: number;
}

class BrowserService {
  private sessions: Map<string, BrowserSession> = new Map();

  /**
   * Start a new browser session with noVNC
   */
  async startSession(userId: string): Promise<BrowserSession> {
    const sessionId = crypto.randomUUID();
    const vncPort = 5900 + Math.floor(Math.random() * 1000);
    const novncPort = 6080 + Math.floor(Math.random() * 1000);

    try {
      const container = await docker.createContainer({
        Image: 'kasmweb/chrome:1.15.0',
        Env: [
          `VNC_PORT=${vncPort}`,
          `NOVNC_PORT=${novncPort}`,
          'KASM_PASSWORD=secret',
          'USER=root',
        ],
        ExposedPorts: {
          [`${vncPort}/tcp`]: {},
          [`${novncPort}/tcp`]: {},
        },
        HostConfig: {
          PortBindings: {
            [`${vncPort}/tcp`]: [{ HostPort: String(vncPort) }],
            [`${novncPort}/tcp`]: [{ HostPort: String(novncPort) }],
          },
          Memory: 512 * 1024 * 1024, // 512MB limit
          CpuPeriod: 100000,
          CpuQuota: 50000, // 50% CPU
        },
        Labels: {
          'chatbot-saas': 'true',
          'session-id': sessionId,
          'user-id': userId,
        },
      });

      await container.start();

      const session: BrowserSession = {
        id: sessionId,
        containerId: container.id,
        vncUrl: `vnc://localhost:${vncPort}`,
        websocketUrl: `ws://localhost:${novncPort}/websockify`,
        status: 'running',
        userId,
        createdAt: Date.now(),
      };

      this.sessions.set(sessionId, session);

      // Auto-cleanup after 1 hour
      setTimeout(() => {
        this.stopSession(sessionId).catch(console.error);
      }, 60 * 60 * 1000);

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
      console.error('Error stopping container:', error);
    }

    session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  /**
   * Get session status
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

    // Wait a bit for screenshot
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get screenshot
    const stream = await container.getArchive({ path: '/tmp/screenshot.png' });
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Execute a command in the browser
   */
  async executeCommand(sessionId: string, command: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

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
}

export const browserService = new BrowserService();
