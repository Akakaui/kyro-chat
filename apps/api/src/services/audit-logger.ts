import { getPgPool, isPostgreSQLAvailable } from '../db/init.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Audit Logger — records security events, auth attempts, and permission
// changes to the PostgreSQL audit_log table.
//
// All methods are safe to call even when PostgreSQL is not available: they
// fall back to console.warn and return gracefully.
// ---------------------------------------------------------------------------

/** Categories for audit log entries */
export type AuditCategory = 'auth' | 'authorization' | 'security' | 'permission' | 'rate_limit' | 'admin';

/** Audit event types */
export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'token_refresh'
  | 'token_expired'
  | 'authorization_denied'
  | 'permission_granted'
  | 'permission_revoked'
  | 'role_assigned'
  | 'role_removed'
  | 'rate_limit_exceeded'
  | 'account_locked'
  | 'account_unlocked'
  | 'user_created'
  | 'user_deleted'
  | 'user_suspended'
  | 'settings_changed'
  | 'security_event';

/** Options for querying audit logs */
export interface AuditLogQueryOptions {
  limit?: number;
  offset?: number;
  category?: AuditCategory;
  eventType?: AuditEventType;
  startDate?: number;
  endDate?: number;
  orderDirection?: 'ASC' | 'DESC';
}

/** A single audit log entry */
export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  event_type: string;
  category: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

/** Filter options for security events */
export interface SecurityEventFilter {
  eventType?: AuditEventType;
  userId?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Math.floor(Date.now());
}

/**
 * Execute a query against the audit_log table.
 * Falls back to console.warn if PostgreSQL is unavailable.
 */
async function executeQuery(
  query: string,
  params: unknown[] = []
): Promise<unknown> {
  if (!isPostgreSQLAvailable()) {
    console.warn('[audit-logger] PostgreSQL not available — audit log not recorded');
    return null;
  }

  try {
    const pool = getPgPool();
    const result = await pool.query(query, params);
    return result;
  } catch (err) {
    console.error('[audit-logger] Query failed:', err);
    return null;
  }
}

/**
 * Insert a single audit log entry.
 */
async function insertLog(entry: {
  user_id?: string | null;
  event_type: string;
  category: string;
  resource_type?: string | null;
  resource_id?: string | null;
  action?: string | null;
  details?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}): Promise<void> {
  await executeQuery(
    `INSERT INTO audit_log (id, user_id, event_type, category, resource_type, resource_id, action, details, ip_address, user_agent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      generateId(),
      entry.user_id || null,
      entry.event_type,
      entry.category,
      entry.resource_type || null,
      entry.resource_id || null,
      entry.action || null,
      entry.details || null,
      entry.ip_address || null,
      entry.user_agent || null,
      now(),
    ]
  );
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Log an authentication attempt (success or failure).
 */
export async function logAuthentication(
  userId: string | null,
  success: boolean,
  ipAddress?: string | null,
  userAgent?: string | null,
  details?: string | null
): Promise<void> {
  await insertLog({
    user_id: userId,
    event_type: success ? 'login_success' : 'login_failure',
    category: 'auth',
    action: 'authenticate',
    details: details || (success ? 'Authentication successful' : 'Authentication failed'),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });

  if (!success) {
    console.warn(`[audit-logger] Failed login attempt for user=${userId} ip=${ipAddress}`);
  }
}

/**
 * Log an authorization failure — user lacked permission for a resource/action.
 */
export async function logAuthorizationFailure(
  userId: string | null,
  resource: string,
  action: string,
  reason: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await insertLog({
    user_id: userId,
    event_type: 'authorization_denied',
    category: 'authorization',
    resource_type: resource,
    action,
    details: `Authorization denied: ${reason}`,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });
}

/**
 * Log a security event (e.g., account locked, suspicious activity).
 */
export async function logSecurityEvent(
  userId: string | null,
  eventType: string,
  details: string
): Promise<void> {
  await insertLog({
    user_id: userId,
    event_type: eventType,
    category: 'security',
    resource_type: null,
    action: null,
    details,
    ip_address: null,
    user_agent: null,
  });

  console.warn(`[audit-logger] Security event: ${eventType} user=${userId} — ${details}`);
}

/**
 * Log a permission change (grant or revoke).
 */
export async function logPermissionChange(
  userId: string | null,
  targetUserId: string,
  permission: string,
  action: 'granted' | 'revoked',
  performedBy: string
): Promise<void> {
  await insertLog({
    user_id: targetUserId,
    event_type: action === 'granted' ? 'permission_granted' : 'permission_revoked',
    category: 'permission',
    resource_type: 'permission',
    action: `${action}:${permission}`,
    details: `Permission "${permission}" ${action} by user ${performedBy}${userId ? ` (impersonating ${userId})` : ''}`,
    ip_address: null,
    user_agent: null,
  });
}

/**
 * Log a rate limit exceeded event.
 */
export async function logRateLimitExceeded(
  identifier: string,
  ipAddress: string | null,
  path: string,
  method: string
): Promise<void> {
  await insertLog({
    user_id: identifier.startsWith('user:') ? identifier.slice(5) : null,
    event_type: 'rate_limit_exceeded',
    category: 'rate_limit',
    resource_type: 'endpoint',
    resource_id: path,
    action: method.toLowerCase(),
    details: `Rate limit exceeded for ${identifier} on ${method} ${path}`,
    ip_address: ipAddress || null,
    user_agent: null,
  });
}

/**
 * Query audit logs with optional filters and pagination.
 */
export async function getAuditLogs(
  userId: string,
  options: AuditLogQueryOptions = {}
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  if (!isPostgreSQLAvailable()) {
    return { logs: [], total: 0 };
  }

  const {
    limit = 50,
    offset = 0,
    category,
    eventType,
    startDate,
    endDate,
    orderDirection: rawOrderDirection = 'DESC',
  } = options;

  // Whitelist allowed ORDER BY directions to prevent SQL injection
  const ALLOWED_DIRECTIONS = new Set(['ASC', 'DESC']);
  const orderDirection = ALLOWED_DIRECTIONS.has(rawOrderDirection.toUpperCase())
    ? rawOrderDirection.toUpperCase()
    : 'DESC';

  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(category);
  }
  if (eventType) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(eventType);
  }
  if (startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  const whereClause = conditions.join(' AND ');

  try {
    const pool = getPgPool();
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const dataResult = await pool.query(
      `SELECT * FROM audit_log WHERE ${whereClause} ORDER BY created_at ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      logs: dataResult.rows as AuditLogEntry[],
      total,
    };
  } catch (err) {
    console.error('[audit-logger] Failed to query audit logs:', err);
    return { logs: [], total: 0 };
  }
}

/**
 * Query security events with filters and pagination.
 */
export async function getSecurityEvents(
  filters: SecurityEventFilter = {}
): Promise<{ events: AuditLogEntry[]; total: number }> {
  if (!isPostgreSQLAvailable()) {
    return { events: [], total: 0 };
  }

  const conditions: string[] = ['category = $1'];
  const params: unknown[] = ['security'];
  let paramIndex = 2;

  if (filters.eventType) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(filters.eventType);
  }
  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }
  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  const whereClause = conditions.join(' AND ');

  try {
    const pool = getPgPool();
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const dataResult = await pool.query(
      `SELECT * FROM audit_log WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      events: dataResult.rows as AuditLogEntry[],
      total,
    };
  } catch (err) {
    console.error('[audit-logger] Failed to query security events:', err);
    return { events: [], total: 0 };
  }
}

/**
 * Log a role assignment event.
 */
export async function logRoleAssignment(
  userId: string,
  roleName: string,
  assignedBy: string,
  ipAddress?: string | null
): Promise<void> {
  await insertLog({
    user_id: userId,
    event_type: 'role_assigned',
    category: 'permission',
    resource_type: 'role',
    resource_id: roleName,
    action: 'assign',
    details: `Role "${roleName}" assigned by ${assignedBy}`,
    ip_address: ipAddress || null,
    user_agent: null,
  });
}

/**
 * Log a role removal event.
 */
export async function logRoleRemoval(
  userId: string,
  roleName: string,
  removedBy: string,
  ipAddress?: string | null
): Promise<void> {
  await insertLog({
    user_id: userId,
    event_type: 'role_removed',
    category: 'permission',
    resource_type: 'role',
    resource_id: roleName,
    action: 'remove',
    details: `Role "${roleName}" removed by ${removedBy}`,
    ip_address: ipAddress || null,
    user_agent: null,
  });
}
