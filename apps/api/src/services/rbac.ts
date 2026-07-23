import { getPgPool, isPostgreSQLAvailable } from '../db/init.js';
import { logRoleAssignment, logRoleRemoval, logPermissionChange } from './audit-logger.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// RBAC Service — Role-Based Access Control for Kyro Chat.
//
// Manages roles, permissions, and user-role assignments in PostgreSQL.
// Permission format: "resource:action" — e.g., "conversations:create"
// Wildcard support: "*:*" for all resources and actions,
// "conversations:*" for all actions on a resource.
// ---------------------------------------------------------------------------

// ── Types ─────────────────────────────────────────────────────────────────

/** Default system role identifiers */
export const SYSTEM_ROLES = {
  ADMIN: 'role_admin',
  EDITOR: 'role_editor',
  USER: 'role_user',
  VIEWER: 'role_viewer',
} as const;

/** System role type */
export type SystemRoleId = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** A role definition */
export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: number;
}

/** A permission entry */
export interface Permission {
  role_id: string;
  permission: string;
}

/** A user-role assignment */
export interface UserRole {
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  assigned_at: number;
  expires_at: number | null;
}

/** Permission string in "resource:action" format */
export type PermissionString = `${string}:${string}`;

/** Result of a permission check */
export interface PermissionCheckResult {
  allowed: boolean;
  role: string | null;
  permission: string | null;
}

// ── Default role configurations ───────────────────────────────────────────

interface DefaultRoleConfig {
  id: string;
  name: string;
  description: string;
  permissions: PermissionString[];
}

const DEFAULT_ROLES: DefaultRoleConfig[] = [
  {
    id: SYSTEM_ROLES.ADMIN,
    name: 'admin',
    description: 'Full system access — all resources and actions',
    permissions: ['*:*'],
  },
  {
    id: SYSTEM_ROLES.EDITOR,
    name: 'editor',
    description: 'Can manage conversations, read agents and settings',
    permissions: [
      'conversations:*',
      'agents:read',
      'settings:read',
    ],
  },
  {
    id: SYSTEM_ROLES.USER,
    name: 'user',
    description: 'Standard user — can create and manage own conversations, read agents',
    permissions: [
      'conversations:create',
      'conversations:read',
      'conversations:update',
      'agents:read',
    ],
  },
  {
    id: SYSTEM_ROLES.VIEWER,
    name: 'viewer',
    description: 'Read-only access to conversations',
    permissions: [
      'conversations:read',
    ],
  },
];

// ── Role Hierarchy (for ordered privilege resolution) ─────────────────────

const ROLE_HIERARCHY: Record<string, number> = {
  [SYSTEM_ROLES.ADMIN]: 100,
  [SYSTEM_ROLES.EDITOR]: 70,
  [SYSTEM_ROLES.USER]: 40,
  [SYSTEM_ROLES.VIEWER]: 10,
};

// ── Internal helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Maximum value for a PostgreSQL INTEGER column (32-bit signed).
 * Values above this overflow and cause runtime errors.
 */
const MAX_INTEGER_VALUE = 2_147_483_647;

/**
 * Convert a JavaScript millisecond timestamp to a safe PostgreSQL integer
 * (seconds since epoch), with bounds checking to prevent overflow.
 * Returns null if the value is outside the safe range.
 */
function safeTimestamp(msTimestamp?: number | null): number | null {
  if (msTimestamp == null) return null;
  // Convert milliseconds to seconds
  const seconds = Math.floor(msTimestamp / 1000);
  // Clamp to PostgreSQL INTEGER max
  return Math.min(seconds, MAX_INTEGER_VALUE);
}

/**
 * Returns the current time as a safe PostgreSQL integer timestamp (seconds).
 */
function nowTimestamp(): number {
  return safeTimestamp(Date.now())!;
}

/**
 * Execute a parameterized query against PostgreSQL.
 * Returns rows array or throws.
 * Gracefully returns empty array when PostgreSQL is not available.
 */
async function queryRows<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!isPostgreSQLAvailable()) {
    return [];
  }
  const pool = getPgPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Execute a single-row query.
 * Gracefully returns null when PostgreSQL is not available.
 */
async function queryRow<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a write query (INSERT, UPDATE, DELETE) against PostgreSQL.
 */
async function executeWrite(
  text: string,
  params: unknown[] = []
): Promise<void> {
  if (!isPostgreSQLAvailable()) {
    return;
  }
  const pool = getPgPool();
  await pool.query(text, params);
}

// ── RoleManager ───────────────────────────────────────────────────────────

export class RoleManager {
  /**
   * Initialize the four default system roles and their permissions.
   * Safe to call multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
   */
  static async initializeDefaultRoles(): Promise<void> {
    if (!isPostgreSQLAvailable()) {
      console.warn('[rbac] PostgreSQL not available — skipping role initialization');
      return;
    }

    for (const role of DEFAULT_ROLES) {
      // Insert role if it doesn't exist
      await executeWrite(
        `INSERT INTO roles (id, name, description, is_system, created_at)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           is_system = TRUE`,
        [role.id, role.name, role.description, nowTimestamp()]
      );

      // Insert permissions for this role
      for (const permission of role.permissions) {
        await executeWrite(
          `INSERT INTO role_permissions (role_id, permission)
           VALUES ($1, $2)
           ON CONFLICT (role_id, permission) DO NOTHING`,
          [role.id, permission]
        );
      }
    }

    console.log('[rbac] Default roles initialized:', DEFAULT_ROLES.map((r) => r.name).join(', '));
  }

  /**
   * Create a custom role.
   */
  static async createRole(
    name: string,
    description?: string,
    permissions: PermissionString[] = []
  ): Promise<Role> {
    const id = `role_${generateId()}`;

    await executeWrite(
      `INSERT INTO roles (id, name, description, is_system, created_at)
       VALUES ($1, $2, $3, FALSE, $4)`,
      [id, name, description || null, nowTimestamp()]
    );

    // Assign initial permissions
    for (const permission of permissions) {
      await executeWrite(
        `INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)`,
        [id, permission]
      );
    }

    return {
      id,
      name,
      description: description || null,
      is_system: false,
      created_at: nowTimestamp()!,
    };
  }

  /**
   * Delete a role (non-system roles only).
   */
  static async deleteRole(roleId: string): Promise<boolean> {
    const role = await queryRow<Role>('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (!role) return false;
    if (role.is_system) {
      throw new Error(`Cannot delete system role "${role.name}"`);
    }

    await executeWrite('DELETE FROM roles WHERE id = $1', [roleId]);
    return true;
  }

  /**
   * List all roles.
   */
  static async listRoles(): Promise<Role[]> {
    return queryRows<Role>(
      'SELECT * FROM roles ORDER BY is_system DESC, name ASC'
    );
  }

  /**
   * Get a single role by ID.
   */
  static async getRole(roleId: string): Promise<Role | null> {
    return queryRow<Role>('SELECT * FROM roles WHERE id = $1', [roleId]);
  }

  /**
   * Get a role by name.
   */
  static async getRoleByName(name: string): Promise<Role | null> {
    return queryRow<Role>('SELECT * FROM roles WHERE name = $1', [name]);
  }
}

// ── PermissionSystem ──────────────────────────────────────────────────────

export class PermissionSystem {
  /**
   * Check if a role has a specific permission.
   * Supports wildcards: "*:*" matches everything, "resource:*" matches all actions on a resource.
   */
  static async roleHasPermission(
    roleId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const permissions = await queryRows<Permission>(
      'SELECT permission FROM role_permissions WHERE role_id = $1',
      [roleId]
    );

    for (const { permission } of permissions) {
      if (PermissionSystem.matchesPermission(permission, resource, action)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a permission string matches a resource:action pair.
   * Supports wildcards: "*:*" matches everything.
   */
  static matchesPermission(
    permission: string,
    resource: string,
    action: string
  ): boolean {
    // "*:*" matches everything
    if (permission === '*:*') return true;

    const parts = permission.split(':');
    if (parts.length !== 2) return false;

    const [permResource, permAction] = parts;

    // "resource:*" matches all actions on resource
    if (permResource === resource && permAction === '*') return true;
    if (permResource === '*' && permAction === action) return true;

    // Exact match
    return permResource === resource && permAction === action;
  }

  /**
   * Check if a user can perform an action on a resource.
   * This is the main permission check method.
   * Checks all roles assigned to the user in order of hierarchy.
   */
  static async can(
    userId: string,
    resource: string,
    action: string
  ): Promise<PermissionCheckResult> {
    if (!isPostgreSQLAvailable()) {
      // When PostgreSQL is not available, check env-based admin
      return { allowed: false, role: null, permission: null };
    }

    const userRoles = await UserRoleService.getUserRolesWithDetails(userId);

    // Sort by hierarchy (highest privilege first)
    const sortedRoles = userRoles.sort(
      (a, b) => (ROLE_HIERARCHY[b.role_id] || 0) - (ROLE_HIERARCHY[a.role_id] || 0)
    );

    for (const userRole of sortedRoles) {
      // Check if role is expired (expires_at is stored in seconds)
      if (userRole.expires_at && userRole.expires_at < nowTimestamp()!) {
        continue;
      }

      const permissions = await queryRows<Permission>(
        'SELECT permission FROM role_permissions WHERE role_id = $1',
        [userRole.role_id]
      );

      for (const { permission } of permissions) {
        if (PermissionSystem.matchesPermission(permission, resource, action)) {
          const role = await RoleManager.getRole(userRole.role_id);
          return {
            allowed: true,
            role: role?.name || null,
            permission,
          };
        }
      }
    }

    return { allowed: false, role: null, permission: null };
  }

  /**
   * Get all permissions for a role.
   */
  static async getRolePermissions(
    roleId: string
  ): Promise<string[]> {
    const rows = await queryRows<Permission>(
      'SELECT permission FROM role_permissions WHERE role_id = $1 ORDER BY permission',
      [roleId]
    );
    return rows.map((r) => r.permission);
  }

  /**
   * Grant a permission to a role.
   */
  static async grantPermission(
    roleId: string,
    permission: PermissionString
  ): Promise<void> {
    await executeWrite(
      `INSERT INTO role_permissions (role_id, permission)
       VALUES ($1, $2)
       ON CONFLICT (role_id, permission) DO NOTHING`,
      [roleId, permission]
    );
  }

  /**
   * Revoke a permission from a role.
   */
  static async revokePermission(
    roleId: string,
    permission: PermissionString
  ): Promise<void> {
    await executeWrite(
      'DELETE FROM role_permissions WHERE role_id = $1 AND permission = $2',
      [roleId, permission]
    );
  }
}

// ── UserRoleService ───────────────────────────────────────────────────────

export class UserRoleService {
  /**
   * Assign a role to a user.
   * @param userId - The user's UUID
   * @param roleId - The role's ID
   * @param assignedBy - Who assigned the role (user ID)
   * @param expiresAt - Optional expiration timestamp
   */
  static async assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string,
    expiresAt?: number
  ): Promise<void> {
    await executeWrite(
      `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, role_id) DO UPDATE SET
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = EXCLUDED.assigned_at,
         expires_at = EXCLUDED.expires_at`,
      [userId, roleId, assignedBy || null, nowTimestamp(), safeTimestamp(expiresAt)]
    );

    // Audit log
    const role = await RoleManager.getRole(roleId);
    if (role) {
      await logRoleAssignment(userId, role.name, assignedBy || 'system');
    }
  }

  /**
   * Remove a role from a user.
   */
  static async removeRole(userId: string, roleId: string): Promise<void> {
    const role = await RoleManager.getRole(roleId);

    await executeWrite(
      'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );

    if (role) {
      await logRoleRemoval(userId, role.name, 'system');
    }
  }

  /**
   * Get all role IDs assigned to a user.
   */
  static async getUserRoles(userId: string): Promise<string[]> {
    const rows = await queryRows<{ role_id: string }>(
      'SELECT role_id FROM user_roles WHERE user_id = $1',
      [userId]
    );
    return rows.map((r) => r.role_id);
  }

  /**
   * Get user roles with details (including role name and expiry).
   */
  static async getUserRolesWithDetails(
    userId: string
  ): Promise<(UserRole & { role_name: string })[]> {
    const rows = await queryRows<UserRole & { role_name: string }>(
      `SELECT ur.*, r.name as role_name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId]
    );
    return rows;
  }

  /**
   * Get user roles sorted by privilege (highest first).
   */
  static async getUserRolesWithHierarchy(userId: string): Promise<string[]> {
    const rows = await queryRows<{ role_id: string }>(
      `SELECT ur.role_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY
         CASE ur.role_id
           WHEN 'role_admin' THEN 100
           WHEN 'role_editor' THEN 70
           WHEN 'role_user' THEN 40
           WHEN 'role_viewer' THEN 10
           ELSE 0
         END DESC`,
      [userId]
    );
    return rows.map((r) => r.role_id);
  }

  /**
   * Get all users with a specific role.
   */
  static async getUsersByRole(roleId: string): Promise<string[]> {
    const rows = await queryRows<{ user_id: string }>(
      'SELECT user_id FROM user_roles WHERE role_id = $1',
      [roleId]
    );
    return rows.map((r) => r.user_id);
  }

  /**
   * Check if a user has the admin role.
   */
  static async isUserAdmin(userId: string): Promise<boolean> {
    const roles = await UserRoleService.getUserRoles(userId);
    return roles.includes(SYSTEM_ROLES.ADMIN);
  }

  /**
   * Get all role names for a user.
   */
  static async getUserRoleNames(userId: string): Promise<string[]> {
    const roles = await UserRoleService.getUserRolesWithDetails(userId);
    return roles.map((r) => r.role_name);
  }

  /**
   * Assign the default "user" role to a new user.
   */
  static async assignDefaultRole(userId: string): Promise<void> {
    await UserRoleService.assignRole(userId, SYSTEM_ROLES.USER, 'system');
  }
}

// ── Convenience exports ──────────────────────────────────────────────────

/**
 * Check if a user can perform an action on a resource.
 * Convenience wrapper around PermissionSystem.can.
 */
export async function can(
  userId: string,
  resource: string,
  action: string
): Promise<PermissionCheckResult> {
  return PermissionSystem.can(userId, resource, action);
}

/**
 * Check if a user is an admin.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  return UserRoleService.isUserAdmin(userId);
}
