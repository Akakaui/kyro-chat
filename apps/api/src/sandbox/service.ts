import { Sandbox } from 'e2b';

interface SandboxSession {
  id: string;
  sandbox: Sandbox;
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

  async createSession(userId: string, language: string = 'node'): Promise<SandboxSession> {
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'running');

    if (userSessions.length >= this.maxSessionsPerUser) {
      const oldest = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      await this.destroySession(oldest.id);
    }

    const sessionId = crypto.randomUUID();

    try {
      const sandbox = await Sandbox.create({
        template: this.getE2BTemplate(language),
        metadata: {
          'session-id': sessionId,
          'user-id': userId,
        },
      });

      await sandbox.keepAlive(30 * 60); // 30 minutes

      const session: SandboxSession = {
        id: sessionId,
        sandbox,
        status: 'running',
        userId,
        language,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      this.sessions.set(sessionId, session);

      setTimeout(() => {
        this.destroySession(sessionId).catch(console.error);
      }, this.sessionTimeout);

      return session;
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
    }
  }

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
      const result = await session.sandbox.runCode(code, {
        language: this.getE2BLanguage(lang),
        timeout: 30,
      });

      const executionTime = Date.now() - startTime;
      session.status = 'running';

      return {
        stdout: result.logs?.stdout?.join('\n') || '',
        stderr: result.logs?.stderr?.join('\n') || result.error?.value || '',
        exitCode: result.error ? 1 : 0,
        executionTime,
      };
    } catch (error: any) {
      session.status = 'running';
      throw error;
    }
  }

  async installPackage(sessionId: string, packageName: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    let installCmd: string;
    switch (session.language) {
      case 'node':
      case 'javascript':
      case 'typescript':
        installCmd = `npm install ${packageName}`;
        break;
      case 'python':
        installCmd = `pip install ${packageName}`;
        break;
      default:
        throw new Error(`Package install not supported for ${session.language}`);
    }

    const result = await this.execute(sessionId, installCmd, 'bash');
    return result.stdout + result.stderr;
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopping';

    try {
      await session.sandbox.kill();
    } catch (error) {
      console.error('Error destroying sandbox:', error);
    }

    session.status = 'stopped';
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(userId: string): SandboxSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status !== 'stopped');
  }

  private getE2BTemplate(language: string): string {
    switch (language) {
      case 'node':
      case 'javascript':
      case 'typescript':
        return 'node';
      case 'python':
        return 'python';
      case 'go':
        return 'go';
      case 'bash':
      case 'shell':
        return 'base';
      default:
        return 'base';
    }
  }

  private getE2BLanguage(language: string): string {
    switch (language) {
      case 'node':
      case 'javascript':
        return 'javascript';
      case 'typescript':
        return 'typescript';
      case 'python':
        return 'python';
      case 'go':
        return 'go';
      case 'bash':
      case 'shell':
        return 'bash';
      default:
        return 'javascript';
    }
  }

  async cleanupAll(): Promise<void> {
    const sessions = Array.from(this.sessions.keys());
    for (const sessionId of sessions) {
      await this.destroySession(sessionId);
    }
  }
}

export const sandboxService = new SandboxService();
