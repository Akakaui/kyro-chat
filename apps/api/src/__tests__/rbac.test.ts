import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// RBAC Service Tests
//
// These tests validate role management, permission checks, and user-role
// assignment logic without requiring a PostgreSQL connection.
// We mock the database layer to test the business logic in isolation.
// ---------------------------------------------------------------------------

// Mock the database module before importing the RBAC service
vi.mock('../db/init.js', () => ({
  getPgPool: vi.fn(() => {
    // Return a mock pool that throws for any query
    throw new Error('PostgreSQL not available in test');
  }),
  isPostgreSQLAvailable: vi.fn(() => false),
}));

// Re-import after mocking
import { RoleManager, PermissionSystem, UserRoleService, SYSTEM_ROLES } from '../services/rbac.js';

describe('RBAC Service', () => {
  describe('PermissionSystem.matchesPermission', () => {
    it('should match wildcard *:*', () => {
      expect(PermissionSystem.matchesPermission('*:*', 'conversations', 'create')).toBe(true);
      expect(PermissionSystem.matchesPermission('*:*', 'agents', 'delete')).toBe(true);
      expect(PermissionSystem.matchesPermission('*:*', 'any', 'thing')).toBe(true);
    });

    it('should match resource wildcard', () => {
      expect(PermissionSystem.matchesPermission('conversations:*', 'conversations', 'create')).toBe(true);
      expect(PermissionSystem.matchesPermission('conversations:*', 'conversations', 'read')).toBe(true);
      expect(PermissionSystem.matchesPermission('conversations:*', 'conversations', 'delete')).toBe(true);
    });

    it('should not match resource wildcard for different resource', () => {
      expect(PermissionSystem.matchesPermission('conversations:*', 'agents', 'read')).toBe(false);
    });

    it('should match exact permission', () => {
      expect(PermissionSystem.matchesPermission('conversations:create', 'conversations', 'create')).toBe(true);
    });

    it('should not match different action', () => {
      expect(PermissionSystem.matchesPermission('conversations:create', 'conversations', 'delete')).toBe(false);
    });

    it('should not match different resource', () => {
      expect(PermissionSystem.matchesPermission('conversations:create', 'agents', 'create')).toBe(false);
    });

    it('should handle malformed permission string', () => {
      expect(PermissionSystem.matchesPermission('invalid', 'resource', 'action')).toBe(false);
      expect(PermissionSystem.matchesPermission('', 'resource', 'action')).toBe(false);
    });

    it('should match action wildcard', () => {
      expect(PermissionSystem.matchesPermission('*:read', 'conversations', 'read')).toBe(true);
      expect(PermissionSystem.matchesPermission('*:read', 'agents', 'read')).toBe(true);
    });

    it('should not match action wildcard for different action', () => {
      expect(PermissionSystem.matchesPermission('*:read', 'conversations', 'write')).toBe(false);
    });
  });

  describe('SYSTEM_ROLES', () => {
    it('should have all required system roles', () => {
      expect(SYSTEM_ROLES.ADMIN).toBe('role_admin');
      expect(SYSTEM_ROLES.EDITOR).toBe('role_editor');
      expect(SYSTEM_ROLES.USER).toBe('role_user');
      expect(SYSTEM_ROLES.VIEWER).toBe('role_viewer');
    });

    it('should have unique role IDs', () => {
      const roleIds = Object.values(SYSTEM_ROLES);
      const uniqueIds = new Set(roleIds);
      expect(roleIds.length).toBe(uniqueIds.size);
    });
  });

  describe('RoleManager.initializeDefaultRoles', () => {
    it('should not throw when PostgreSQL is unavailable', async () => {
      // Should gracefully handle missing PostgreSQL
      await expect(RoleManager.initializeDefaultRoles()).resolves.not.toThrow();
    });
  });

  describe('PermissionSystem.can', () => {
    it('should return not allowed when PostgreSQL is unavailable', async () => {
      const result = await PermissionSystem.can('test-user', 'conversations', 'read');
      expect(result.allowed).toBe(false);
      expect(result.role).toBeNull();
      expect(result.permission).toBeNull();
    });
  });

  describe('UserRoleService', () => {
    it('should handle PostgreSQL unavailable gracefully', async () => {
      // All these methods should work without crashing when PG is not available
      await expect(UserRoleService.assignRole('u1', 'role_user')).resolves.not.toThrow();
      await expect(UserRoleService.removeRole('u1', 'role_user')).resolves.not.toThrow();

      const roles = await UserRoleService.getUserRoles('u1');
      expect(roles).toEqual([]);

      const hierarchy = await UserRoleService.getUserRolesWithHierarchy('u1');
      expect(hierarchy).toEqual([]);

      const isAdmin = await UserRoleService.isUserAdmin('u1');
      expect(isAdmin).toBe(false);

      const roleNames = await UserRoleService.getUserRoleNames('u1');
      expect(roleNames).toEqual([]);
    });
  });

  describe('can and isUserAdmin exports', () => {
    it('should be exported and callable', async () => {
      // Dynamic import to get the named exports
      const { can, isUserAdmin } = await import('../services/rbac.js');

      const canResult = await can('test-user', 'resource', 'action');
      expect(canResult).toHaveProperty('allowed');
      expect(canResult).toHaveProperty('role');
      expect(canResult).toHaveProperty('permission');

      const adminResult = await isUserAdmin('test-user');
      expect(adminResult).toBe(false);
    });
  });
});
