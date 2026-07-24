import { Sandbox } from 'e2b';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { pipeline } from 'stream';

const pipelineAsync = promisify(pipeline);

export interface SandboxSession {
  id: string;
  sandbox: Sandbox;
  status: 'creating' | 'running' | 'executing' | 'stopping' | 'stopped';
  userId: string;
  language: string;
  persistent: boolean;
  createdAt: number;
  lastUsed: number;
  expiresAt: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
}

export interface TemporaryFile {
  path: string;
  name: string;
  size: number;
  type: string;
  createdAt: number;
}

// TS7 type-resolution workaround for E2B Sandbox class
interface E2BSandbox {
  readonly sandboxId: string;
  readonly files: {
    write(path: string, data: string): Promise<void>;
    read(path: string): Promise<string>;
    list(path: string): Promise<Array<{ name: string; type: string; size: number }>>;
  };
  readonly commands: {
    run(
      cmd: string,
      opts?: { background?: boolean; cwd?: string; env?: Record<string, string> },
    ): Promise<{ wait(): Promise<void>; output: Promise<string> }>;
  };
  setTimeout(ms: number): Promise<void>;
  getHost(port: number): string;
  keepAlive(ms: number): Promise<void>;
  kill(): Promise<void>;
  runCode(code: string, opts?: { language?: string; timeout?: number }): Promise<any>;
}

class SandboxService {
  private sessions: Map<string, SandboxSession> = new Map();
  private maxSessionsPerUser = 3;
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private tempFiles: Map<string, Map<string, TemporaryFile>> = new Map();

  async createSession(userId: string, language: string = 'node', persistent: boolean = false): Promise<SandboxSession> {
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'running');

    if (userSessions.length >= this.maxSessionsPerUser) {
      const oldest = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      await this.destroySession(oldest.id);
    }

    const sessionId = crypto.randomUUID();
    const keepAliveMs = persistent ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000; // 24h vs 30min
    const expiresAt = Date.now() + keepAliveMs;

    try {
      const sandbox = await Sandbox.create({
        template: this.getE2BTemplate(language),
        metadata: {
          'session-id': sessionId,
          'user-id': userId,
          'persistent': String(persistent),
        },
      }) as unknown as E2BSandbox;

      await sandbox.keepAlive(persistent ? 24 * 60 * 60 : 30 * 60); // 24h vs 30min

      const session: SandboxSession = {
        id: sessionId,
        sandbox: sandbox as unknown as Sandbox,
        status: 'running',
        userId,
        language,
        persistent,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        expiresAt,
      };

      this.sessions.set(sessionId, session);
      this.tempFiles.set(sessionId, new Map());

      setTimeout(() => {
        this.destroySession(sessionId).catch(console.error);
      }, keepAliveMs);

      return session;
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
    }
  }

  async execute(
    sessionId: string,
    code: string,
    language?: string
  ): Promise<SandboxResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'executing';
    session.lastUsed = Date.now();

    const lang = language || session.language;
    const startTime = Date.now();

    try {
      const sandbox = session.sandbox as unknown as E2BSandbox;
      const result = await sandbox.runCode(code, {
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

  // ──────────────────────────────────────────────
  // New helper methods for sandbox tools
  // ──────────────────────────────────────────────

  async executeCommand(sandboxId: string, command: string): Promise<SandboxResult> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    session.lastUsed = Date.now();
    const startTime = Date.now();

    try {
      const sandbox = session.sandbox as unknown as E2BSandbox;
      const handle = await sandbox.commands.run(command, {});
      await handle.wait();

      const output = await handle.output;
      const executionTime = Date.now() - startTime;

      return {
        stdout: output || '',
        stderr: '',
        exitCode: 0,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        stdout: '',
        stderr: error.message || 'Command execution failed',
        exitCode: error.status || 1,
        executionTime,
      };
    }
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const sandbox = session.sandbox as unknown as E2BSandbox;
    const content = await sandbox.files.read(path);
    this.trackTempFile(sandboxId, path, content);
    return content;
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const sandbox = session.sandbox as unknown as E2BSandbox;

    // Ensure parent directory exists
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    if (dirPath) {
      try {
        await sandbox.commands.run(`mkdir -p ${dirPath}`);
      } catch {
        // Directory may already exist
      }
    }

    await sandbox.files.write(path, content);
    this.trackTempFile(sandboxId, path, content);
  }

  async editFile(sandboxId: string, path: string, oldStr: string, newStr: string): Promise<void> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const sandbox = session.sandbox as unknown as E2BSandbox;

    // Read current content
    const content = await sandbox.files.read(path);

    // Check for exact match
    const count = content.split(oldStr).length - 1;
    if (count === 0) {
      throw new Error('String not found in file');
    }
    if (count > 1) {
      throw new Error(`Found ${count} occurrences. Provide more context to match uniquely.`);
    }

    // Replace and write back
    const newContent = content.replace(oldStr, newStr);
    await sandbox.files.write(path, newContent);
    this.trackTempFile(sandboxId, path, newContent);
  }

  async searchFiles(sandboxId: string, pattern: string, searchPath: string = '/'): Promise<FileEntry[]> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const result = await this.executeCommand(
      sandboxId,
      `find ${searchPath} -name "${pattern}" -type f 2>/dev/null | head -100`
    );

    return result.stdout.split('\n').filter(Boolean).map(filePath => ({
      name: filePath.split('/').pop() || filePath,
      type: 'file' as const,
      path: filePath,
    }));
  }

  async listFiles(sandboxId: string, path: string): Promise<FileEntry[]> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const sandbox = session.sandbox as unknown as E2BSandbox;

    try {
      const items = await sandbox.files.list(path);
      return items.map(item => ({
        name: item.name,
        type: item.type === 'directory' ? 'directory' as const : 'file' as const,
        path: path === '/' ? `/${item.name}` : `${path}/${item.name}`,
        size: item.size,
      }));
    } catch {
      // Fallback to ls command
      const result = await this.executeCommand(sandboxId, `ls -la ${path}`);
      return result.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        const name = parts[parts.length - 1];
        const isDir = line.startsWith('d');
        return {
          name,
          type: isDir ? 'directory' as const : 'file' as const,
          path: path === '/' ? `/${name}` : `${path}/${name}`,
        };
      });
    }
  }

  async installPackage(sessionId: string, packageName: string, manager?: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    let installCmd: string;
    const pkgManager = manager || session.language;

    switch (pkgManager) {
      case 'node':
      case 'javascript':
      case 'typescript':
      case 'npm':
        installCmd = `npm install ${packageName}`;
        break;
      case 'yarn':
        installCmd = `yarn add ${packageName}`;
        break;
      case 'pnpm':
        installCmd = `pnpm add ${packageName}`;
        break;
      case 'python':
      case 'pip':
        installCmd = `pip install ${packageName}`;
        break;
      default:
        throw new Error(`Package install not supported for ${pkgManager}`);
    }

    const result = await this.executeCommand(sessionId, installCmd);
    return result.stdout + result.stderr;
  }

  async getTemporaryFiles(sandboxId: string): Promise<TemporaryFile[]> {
    const files = this.tempFiles.get(sandboxId);
    if (!files) return [];

    return Array.from(files.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async downloadFile(sandboxId: string, path: string): Promise<Buffer> {
    const session = this.sessions.get(sandboxId);
    if (!session) throw new Error('Sandbox session not found');

    const sandbox = session.sandbox as unknown as E2BSandbox;
    const content = await sandbox.files.read(path);
    return Buffer.from(content);
  }

  async downloadAllAsZip(sandboxId: string): Promise<Buffer> {
    const files = await this.getTemporaryFiles(sandboxId);
    if (files.length === 0) {
      throw new Error('No temporary files to download');
    }

    // Create a simple tar-like archive (for simplicity, we'll concatenate files)
    // In production, use a proper zip library
    // Fallback: return first file as buffer
    const firstFile = files[0];
    return this.downloadFile(sandboxId, firstFile.path);
  }

  private trackTempFile(sandboxId: string, path: string, content: string): void {
    let files = this.tempFiles.get(sandboxId);
    if (!files) {
      files = new Map();
      this.tempFiles.set(sandboxId, files);
    }

    const name = path.split('/').pop() || path;
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const contentType = this.getMimeType(ext || '');

    files.set(path, {
      path,
      name,
      size: Buffer.byteLength(content),
      type: contentType,
      createdAt: Date.now(),
    });
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'tsx': 'application/typescript',
      'jsx': 'application/javascript',
      'py': 'text/x-python',
      'go': 'text/x-go',
      'rs': 'text/x-rust',
      'html': 'text/html',
      'css': 'text/css',
      'json': 'application/json',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'zip': 'application/zip',
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'stopping';

    try {
      await (session.sandbox as unknown as E2BSandbox).kill();
    } catch (error) {
      console.error('Error destroying sandbox:', error);
    }

    session.status = 'stopped';
    this.sessions.delete(sessionId);
    this.tempFiles.delete(sessionId);
  }

  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(userId: string): SandboxSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status !== 'stopped');
  }

  listPersistentSessions(userId: string): SandboxSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.persistent && s.status === 'running');
  }

  async extendSession(sessionId: string, hours: number = 24): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const extension = hours * 60 * 60 * 1000;
    session.expiresAt = Date.now() + extension;
    session.lastUsed = Date.now();

    const sandbox = session.sandbox as unknown as E2BSandbox;
    await sandbox.keepAlive(hours * 60 * 60);
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
