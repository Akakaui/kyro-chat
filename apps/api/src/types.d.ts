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
