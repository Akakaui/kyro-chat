declare module 'pg' {
  class Pool {
    constructor(config?: Record<string, unknown>);
    query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    end(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  class Client {
    constructor(config?: Record<string, unknown>);
    query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
  export { Pool, Client };
}

declare module 'dockerode' {
  interface ContainerOptions {
    Image?: string;
    Cmd?: string[];
    Env?: string[];
    WorkingDir?: string;
    Tty?: boolean;
    AttachStdin?: boolean;
    AttachStdout?: boolean;
    AttachStderr?: boolean;
    OpenStdin?: boolean;
    StdinOnce?: boolean;
    Detach?: boolean;
    ExposedPorts?: Record<string, object>;
    Labels?: Record<string, string>;
    HostConfig?: {
      PortBindings?: Record<string, Array<{ HostPort: string }>>;
      Binds?: string[];
      Memory?: number;
      CpuPeriod?: number;
      CpuQuota?: number;
      NetworkMode?: string;
      ReadonlyRootfs?: boolean;
    };
  }

  interface Exec {
    inspect(): Promise<any>;
    start(options?: any): Promise<any>;
  }

  class Container {
    id: string;
    start(): Promise<void>;
    stop(options?: { t?: number }): Promise<void>;
    remove(options?: { force?: boolean; v?: boolean }): Promise<void>;
    inspect(): Promise<any>;
    logs(options?: any): Promise<any>;
    exec(options: any): Promise<Exec>;
    getArchive(options: { path: string }): Promise<NodeJS.ReadableStream>;
    putArchive(stream: NodeJS.ReadableStream, options: { path: string }): Promise<void>;
  }

  class Dockerode {
    constructor(options?: { socketPath?: string; host?: string; port?: number });
    createContainer(options: ContainerOptions): Promise<Container>;
    getContainer(id: string): Container;
    createImage(options: { fromImage: string; tag?: string }): Promise<any>;
  }

  namespace Dockerode {
    type Container = InstanceType<typeof import('dockerode')['default']>;
  }

  export = Dockerode;
}

declare module 'e2b' {
  interface ConnectionOpts {
    apiKey?: string;
    domain?: string;
    requestTimeoutMs?: number;
    headers?: Record<string, string>;
  }

  interface SandboxOpts extends ConnectionOpts {
    template?: string;
    metadata?: Record<string, string>;
    timeoutMs?: number;
    envs?: Record<string, string>;
  }

  interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
  }

  interface CommandStartOpts {
    cwd?: string;
    envs?: Record<string, string>;
    user?: string;
    timeoutMs?: number;
    background?: boolean;
  }

  interface FilesystemEntry {
    name: string;
    isDir: boolean;
    size?: number;
  }

  interface Filesystem {
    write(path: string, content: string): Promise<void>;
    read(path: string): Promise<string>;
    list(path: string): Promise<FilesystemEntry[]>;
  }

  interface Commands {
    run(cmd: string, opts?: CommandStartOpts): Promise<CommandResult>;
  }

  class Sandbox {
    static create(opts?: SandboxOpts): Promise<Sandbox>;
    static create<S extends typeof Sandbox>(this: S, template: string, opts?: SandboxOpts): Promise<InstanceType<S>>;
    readonly files: Filesystem;
    readonly commands: Commands;
    readonly sandboxId: string;
    kill(): Promise<boolean>;
  }

  export { Sandbox, SandboxOpts, CommandResult };
}

declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: any);
    prepare(source: string): any;
    exec(source: string): this;
    pragma(source: string, options?: any): any;
    transaction<F extends (...args: any[]) => any>(fn: F): F;
    close(): this;
    defaultSafeIntegers(toggle?: boolean): this;
  }

  namespace Database {
    type Database = InstanceType<typeof import('better-sqlite3')>;
  }

  export = Database;
}

declare module 'nodemailer' {
  interface SendMailOptions {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename?: string;
      content?: string | Buffer;
      path?: string;
      contentType?: string;
    }>;
  }

  interface Transporter {
    sendMail(options: SendMailOptions): Promise<any>;
    verify(): Promise<boolean>;
    close(): void;
  }

  function createTransport(options: any): Transporter;
  export { createTransport, SendMailOptions, Transporter };
}

declare module 'imap-simple' {
  interface ImapConfig {
    user: string;
    password: string;
    host: string;
    port: number;
    tls?: boolean;
    tlsOptions?: { rejectUnauthorized?: boolean };
  }

  interface Message {
    attributes: { uid: number; [key: string]: any };
    parts: Array<{ which: string; body: any }>;
  }

  interface Connection {
    end(): void;
    openBox(boxName: string, autoExpunge?: boolean, callback?: (err: Error, box: any) => void): void;
    search(criteria: any[], options?: any): Promise<Message[]>;
    addFlags(uid: number | string, flags: string | string[], callback?: (err: Error) => void): void;
  }

  function connect(config: ImapConfig | { imap: ImapConfig }): Promise<Connection>;
  export { connect, ImapConfig, Connection, Message };
}

declare module 'mailparser' {
  interface AddressObject {
    value: Array<{ address: string; name: string }>;
    text: string;
  }

  interface ParsedMail {
    from?: AddressObject;
    to?: AddressObject;
    cc?: AddressObject;
    subject?: string;
    text?: string;
    textAsHtml?: string;
    html?: string | false;
    date?: Date;
    messageId?: string;
    attachments?: Array<{
      filename?: string;
      contentType: string;
      size: number;
      content: Buffer;
    }>;
  }

  function simpleParser(source: string | NodeJS.ReadableStream): Promise<ParsedMail>;
  export { simpleParser, ParsedMail };
}
