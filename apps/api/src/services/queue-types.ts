// ---------------------------------------------------------------------------
// Job Queue Types
// ---------------------------------------------------------------------------

export type JobType =
  | 'email-send'
  | 'token-refresh'
  | 'audit-log-flush'
  | 'analytics-aggregate';

export interface Job<T = unknown> {
  id: string;
  type: JobType;
  data: T;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
}

export interface JobOptions {
  /** Delay processing by N seconds.  Default: 0 (immediate). */
  delay?: number;
  /** Max retry attempts.  Default: 3. */
  maxAttempts?: number;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

// ── ID generator ──────────────────────────────────────────────────────────

let idCounter = 0;

export function generateJobId(): string {
  idCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const seq = idCounter.toString(36);
  return `job_${ts}_${rand}_${seq}`;
}
