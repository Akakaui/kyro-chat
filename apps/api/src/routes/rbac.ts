import { Hono } from 'hono';
import { z } from 'zod';
import { RoleManager, PermissionSystem, UserRoleService, SYSTEM_ROLES } from '../services/rbac.js';
import { logPermissionChange } from '../services/audit-logger.js';

// ---------------------------------------------------------------------------
// RBAC Management Routes
//
// All routes require 'admin' role (enforced in index.ts via requireAdmin).
// Provides CRUD for roles, permissions, and user-role assignments.
// ---------------------------------------------------------------------------

export const rbacRoutes = new Hono();

// ── Validation schemas ───────────────────────────────────────────────────

const assignRoleSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  roleId: z.string().min(1, 'roleId is required'),
  expiresAt: z.number().optional(),
});

const removeRoleSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  roleId: z.string().min(1, 'roleId is required'),
});

const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
});

const grantPermissionSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
  permission: z.string().min(1, 'Permission is required (format: resource:action)'),
});

const revokePermissionSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
  permission: z.string().min(1, 'Permission is required (format: resource:action)'),
});

const checkPermissionSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  resource: z.string().min(1, 'resource is required'),
  action: z.string().min(1, 'action is required'),
});

// ── Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/rbac/roles — List all roles
 */
rbacRoutes.get('/roles', async (c) => {
  try {
    const roles = await RoleManager.listRoles();
    return c.json({ roles });
  } catch (err) {
    console.error('[rbac] Failed to list roles:', err);
    return c.json({ error: 'Failed to list roles' }, 500);
  }
});

/**
 * GET /api/rbac/roles/:id — Get a specific role
 */
rbacRoutes.get('/roles/:id', async (c) => {
  try {
    const roleId = c.req.param('id');
    const role = await RoleManager.getRole(roleId);

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    const permissions = await PermissionSystem.getRolePermissions(roleId);

    return c.json({ role, permissions });
  } catch (err) {
    console.error('[rbac] Failed to get role:', err);
    return c.json({ error: 'Failed to get role' }, 500);
  }
});

/**
 * POST /api/rbac/roles — Create a custom role
 */
rbacRoutes.post('/roles', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createRoleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { name, description, permissions } = parsed.data;
    const role = await RoleManager.createRole(name, description, permissions as any);

    return c.json({ role }, 201);
  } catch (err: any) {
    if (err?.message?.includes('already exists') || err?.constraint === 'roles_name_key') {
      return c.json({ error: `Role "${err.roleName || 'unknown'}" already exists` }, 409);
    }
    console.error('[rbac] Failed to create role:', err);
    return c.json({ error: 'Failed to create role' }, 500);
  }
});

/**
 * DELETE /api/rbac/roles/:id — Delete a custom role
 */
rbacRoutes.delete('/roles/:id', async (c) => {
  try {
    const roleId = c.req.param('id');

    // Prevent deleting system roles at the route level
    const role = await RoleManager.getRole(roleId);
    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }
    if (role.is_system) {
      return c.json({ error: `Cannot delete system role "${role.name}"` }, 403);
    }

    await RoleManager.deleteRole(roleId);
    return c.json({ success: true });
  } catch (err) {
    console.error('[rbac] Failed to delete role:', err);
    return c.json({ error: 'Failed to delete role' }, 500);
  }
});

/**
 * GET /api/rbac/users/:userId/roles — Get user's roles
 */
rbacRoutes.get('/users/:userId/roles', async (c) => {
  try {
    const userId = c.req.param('userId');
    const roles = await UserRoleService.getUserRoleNames(userId);
    const roleIds = await UserRoleService.getUserRoles(userId);
    const hierarchy = await UserRoleService.getUserRolesWithHierarchy(userId);

    return c.json({
      userId,
      roles,
      roleIds,
      hierarchy,
      isAdmin: roleIds.includes(SYSTEM_ROLES.ADMIN),
    });
  } catch (err) {
    console.error('[rbac] Failed to get user roles:', err);
    return c.json({ error: 'Failed to get user roles' }, 500);
  }
});

/**
 * POST /api/rbac/assign — Assign a role to a user
 */
rbacRoutes.post('/assign', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = assignRoleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { userId, roleId, expiresAt } = parsed.data;
    const adminUser = c.get('user');

    await UserRoleService.assignRole(userId, roleId, adminUser.id, expiresAt);

    // Audit log
    const role = await RoleManager.getRole(roleId);
    await logPermissionChange(
      adminUser.id,
      userId,
      role?.name || roleId,
      'granted',
      adminUser.id
    );

    return c.json({ success: true, message: `Role assigned to user ${userId}` });
  } catch (err) {
    console.error('[rbac] Failed to assign role:', err);
    return c.json({ error: 'Failed to assign role' }, 500);
  }
});

/**
 * POST /api/rbac/remove — Remove a role from a user
 */
rbacRoutes.post('/remove', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = removeRoleSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { userId, roleId } = parsed.data;
    const adminUser = c.get('user');

    await UserRoleService.removeRole(userId, roleId);

    // Audit log
    const role = await RoleManager.getRole(roleId);
    await logPermissionChange(
      adminUser.id,
      userId,
      role?.name || roleId,
      'revoked',
      adminUser.id
    );

    return c.json({ success: true, message: `Role removed from user ${userId}` });
  } catch (err) {
    console.error('[rbac] Failed to remove role:', err);
    return c.json({ error: 'Failed to remove role' }, 500);
  }
});

/**
 * POST /api/rbac/check — Check if a user has a specific permission
 */
rbacRoutes.post('/check', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = checkPermissionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { userId, resource, action } = parsed.data;
    const result = await PermissionSystem.can(userId, resource, action);

    return c.json({
      allowed: result.allowed,
      role: result.role,
      permission: result.permission,
    });
  } catch (err) {
    console.error('[rbac] Failed to check permission:', err);
    return c.json({ error: 'Failed to check permission' }, 500);
  }
});

/**
 * POST /api/rbac/permissions/grant — Grant a permission to a role
 */
rbacRoutes.post('/permissions/grant', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = grantPermissionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { roleId, permission } = parsed.data;
    const adminUser = c.get('user');

    await PermissionSystem.grantPermission(roleId, permission as any);

    await logPermissionChange(
      adminUser.id,
      adminUser.id,
      permission,
      'granted',
      adminUser.id
    );

    return c.json({ success: true, message: `Permission "${permission}" granted to role` });
  } catch (err) {
    console.error('[rbac] Failed to grant permission:', err);
    return c.json({ error: 'Failed to grant permission' }, 500);
  }
});

/**
 * POST /api/rbac/permissions/revoke — Revoke a permission from a role
 */
rbacRoutes.post('/permissions/revoke', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = revokePermissionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { roleId, permission } = parsed.data;
    const adminUser = c.get('user');

    await PermissionSystem.revokePermission(roleId, permission as any);

    await logPermissionChange(
      adminUser.id,
      adminUser.id,
      permission,
      'revoked',
      adminUser.id
    );

    return c.json({ success: true, message: `Permission "${permission}" revoked from role` });
  } catch (err) {
    console.error('[rbac] Failed to revoke permission:', err);
    return c.json({ error: 'Failed to revoke permission' }, 500);
  }
});

/**
 * GET /api/rbac/users-by-role/:roleId — Get all users with a specific role
 */
rbacRoutes.get('/users-by-role/:roleId', async (c) => {
  try {
    const roleId = c.req.param('roleId');
    const userIds = await UserRoleService.getUsersByRole(roleId);
    const role = await RoleManager.getRole(roleId);

    return c.json({
      roleId,
      roleName: role?.name || null,
      userIds,
      count: userIds.length,
    });
  } catch (err) {
    console.error('[rbac] Failed to get users by role:', err);
    return c.json({ error: 'Failed to get users by role' }, 500);
  }
});

/**
 * GET /api/rbac/self — Get current user's RBAC info
 */
rbacRoutes.get('/self', async (c) => {
  const user = c.get('user');

  try {
    const roles = await UserRoleService.getUserRoleNames(user.id);
    const roleIds = await UserRoleService.getUserRoles(user.id);

    return c.json({
      userId: user.id,
      email: user.email,
      roles,
      roleIds,
      isAdmin: roleIds.includes(SYSTEM_ROLES.ADMIN),
    });
  } catch (err) {
    console.error('[rbac] Failed to get self RBAC info:', err);
    // Return basic info even if RBAC queries fail
    return c.json({
      userId: user.id,
      email: user.email,
      roles: user.roles,
      isAdmin: false,
    });
  }
});
