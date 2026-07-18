import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface SandboxSession {
  id: string;
  containerId: string;
  status: 'creating' | 'running' | 'executing' | 'stopping' | 'stopped';
  userId: string;
  language: string;
  createdAt: number;
  lastUsed: number;
}

class SandboxService {
  private sessions: Map<string, SandboxSession> = new Map();
  private maxSessionsPerUser = 3;
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new sandbox environment
   */
  async createSession(userId: string, language: string = 'node'): Promise<SandboxSession> {
    // Check session limit
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'running');

    if (userSessions.length >= this.maxSessionsPerUser) {
      // Reuse oldest session
      const oldest = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      await this.destroySession(oldest.id);
    }

    const sessionId = crypto.randomUUID();
    const image = this.getDockerImage(language);

    try {
      const container = await docker.createContainer({
        Image: image,
        Cmd: ['sleep', 'infinity'],
        Env: [
          'NODE_ENV=development',
          'DEBIAN_FRONTEND=noninteractive',
        ],
        Labels: {
          'chatbot-saas': 'true',
          'sandbox': 'true',
          'session-id': sessionId,
          'user-id': userId,
        },
        HostConfig: {
          Memory: 256 * 1024 * 1024, // 256MB
          CpuPeriod: 100000,
          CpuQuota: 25000, // 25% CPU
          NetworkMode: 'none', // No network access for security
          ReadonlyRootfs: false,
        },
      });

      await container.start();

      const session: SandboxSession = {
        id: sessionId,
        containerId: container.id,
        status: 'running',
        userId,
        language,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      this.sessions.set(sessionId, session);

      // Auto-cleanup after timeout
      setTimeout(() => {
        this.destroySession(sessionId).catch(console.error);
      }, this.sessionTimeout);

      return session;
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
    }
  }

  /**
   * Execute code in sandbox
   */
  async execute(
    sessionId: string,
    code: string,
    language?: string
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'executing';
    session.lastUsed = Date.now();

    const lang = language || session.language;
    const startTime = Date.now();

    try {
      const container = docker.getContainer(session.containerId);
      const { cmd, filename } = this.getExecutionCommand(lang, code);

      // Write code to file
      await this.execCommand(container, `cat > /tmp/${filename} << 'SANDBOX_EOF'\n${code}\nSANDBOX_EOF`);

      // Execute code
      const result = await this.execCommand(container, cmd);

      const executionTime = Date.now() - startTime;

      session.status = 'running';

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime,
      };
    } catch (error: any) {
      session.status = 'running';
      throw error;
    }
  }

  /**
   * Install packages in sandbox
   */
  async installPackage(sessionId: string, packageName: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const container = docker.getContainer(session.containerId);

    let installCmd: string;
    switch (session.language) {
      case 'node':
        installCmd = `npm install ${packageName}`;
        break;
      case 'python':
        installCmd = `pip install ${packageName}`;
        break;
      default:
        throw new Error(`Package install not supported for ${session.language}`);
    }

    const result = await this.execCommand(container, installCmd);
    return result.stdout + result.stderr;
  }

  /**
   * Destroy a sandbox session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopping';

    try {
      const container = docker.getContainer(session.containerId);
      await container.stop({ t: 5 });
      await container.remove();
    } catch (error) {
      console.error('Error destroying sandbox:', error);
    }

    session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List user's sessions
   */
  listSessions(userId: string): SandboxSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status !== 'stopped');
  }

  private getDockerImage(language: string): string {
    switch (language) {
      case 'node':
      case 'javascript':
      case 'typescript':
        return 'node:20-slim';
      case 'python':
        return 'python:3.11-slim';
      case 'go':
        return 'golang:1.21-alpine';
      case 'rust':
        return 'rust:slim';
      case 'java':
        return 'eclipse-temurin:21-jre-jammy';
      default:
        return 'ubuntu:22.04';
    }
  }

  private getExecutionCommand(language: string, code: string): { cmd: string; filename: string } {
    switch (language) {
      case 'node':
      case 'javascript':
        return { cmd: 'node /tmp/code.js', filename: 'code.js' };
      case 'typescript':
        return { cmd: 'npx tsx /tmp/code.ts', filename: 'code.ts' };
      case 'python':
        return { cmd: 'python /tmp/code.py', filename: 'code.py' };
      case 'go':
        return { cmd: 'go run /tmp/code.go', filename: 'code.go' };
      case 'bash':
      case 'shell':
        return { cmd: 'bash /tmp/code.sh', filename: 'code.sh' };
      default:
        return { cmd: `cat /tmp/code`, filename: 'code' };
    }
  }

  private async execCommand(
    container: Docker.Container,
    cmd: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const exec = await container.exec({
      Cmd: ['bash', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      stream.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        if (chunk[0] === 2) {
          stderr += str.slice(8);
        } else {
          stdout += str.slice(8);
        }
      });

      stream.on('end', async () => {
        const inspect = await exec.inspect();
        resolve({
          stdout,
          stderr,
          exitCode: inspect.ExitCode || 0,
        });
      });
    });
  }

  /**
   * Cleanup all sessions
   */
  async cleanupAll(): Promise<void> {
    const sessions = Array.from(this.sessions.keys());
    for (const sessionId of sessions) {
      await this.destroySession(sessionId);
    }
  }
}

export const sandboxService = new SandboxService();
