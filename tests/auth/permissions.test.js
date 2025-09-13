import { 
  getRolePermissions, 
  getRoleBudget, 
  getRoleRateLimit,
  getRoleAIProviders,
  hasRolePermission,
  getRolePermissionsList,
  isValidRole,
  roleHasHigherPrivileges
} from '../../src/config/permissions.js';

describe('Permission System', () => {
  describe('Role Permissions', () => {
    test('should return correct permissions for owner role', () => {
      const permissions = getRolePermissions('owner');
      
      expect(permissions['system.admin']).toBe(true);
      expect(permissions['system.config']).toBe(true);
      expect(permissions['monitoring.dashboard']).toBe(true);
      expect(permissions['ai.chat']).toBe(true);
      expect(permissions['budget.unlimited']).toBe(true);
    });

    test('should return correct permissions for family role', () => {
      const permissions = getRolePermissions('family');
      
      expect(permissions['system.admin']).toBe(false);
      expect(permissions['monitoring.dashboard']).toBe(true);
      expect(permissions['ai.chat']).toBe(true);
      expect(permissions['budget.unlimited']).toBe(false);
    });

    test('should return correct permissions for friend role', () => {
      const permissions = getRolePermissions('friend');
      
      expect(permissions['system.admin']).toBe(false);
      expect(permissions['monitoring.dashboard']).toBe(false);
      expect(permissions['ai.chat']).toBe(true);
      expect(permissions['poker.coach']).toBe(true);
    });

    test('should return demo permissions for invalid role', () => {
      const permissions = getRolePermissions('invalid_role');
      const demoPermissions = getRolePermissions('demo');
      
      expect(permissions).toEqual(demoPermissions);
    });
  });

  describe('Role Budgets', () => {
    test('should return correct budget limits', () => {
      expect(getRoleBudget('owner')).toBe(null); // unlimited
      expect(getRoleBudget('family')).toBe(35.00);
      expect(getRoleBudget('friend')).toBe(10.00);
      expect(getRoleBudget('demo')).toBe(2.00);
    });

    test('should return demo budget for invalid role', () => {
      expect(getRoleBudget('invalid_role')).toBe(2.00);
    });
  });

  describe('Role Rate Limits', () => {
    test('should return correct rate limits', () => {
      expect(getRoleRateLimit('owner')).toBe(1000);
      expect(getRoleRateLimit('family')).toBe(200);
      expect(getRoleRateLimit('friend')).toBe(50);
      expect(getRoleRateLimit('demo')).toBe(10);
    });

    test('should return demo rate limit for invalid role', () => {
      expect(getRoleRateLimit('invalid_role')).toBe(10);
    });
  });

  describe('AI Provider Access', () => {
    test('should return correct AI providers for each role', () => {
      expect(getRoleAIProviders('owner')).toEqual(['claude', 'claude-haiku', 'openai', 'copilot']);
      expect(getRoleAIProviders('family')).toEqual(['claude', 'claude-haiku', 'openai']);
      expect(getRoleAIProviders('friend')).toEqual(['claude-haiku', 'openai']);
      expect(getRoleAIProviders('demo')).toEqual(['claude-haiku']);
    });

    test('should return demo providers for invalid role', () => {
      expect(getRoleAIProviders('invalid_role')).toEqual(['claude-haiku']);
    });
  });

  describe('Permission Checking', () => {
    test('should correctly check role permissions', () => {
      expect(hasRolePermission('owner', 'system.admin')).toBe(true);
      expect(hasRolePermission('family', 'system.admin')).toBe(false);
      expect(hasRolePermission('friend', 'ai.chat')).toBe(true);
      expect(hasRolePermission('demo', 'poker.coach')).toBe(false);
    });

    test('should return false for non-existent permissions', () => {
      expect(hasRolePermission('owner', 'nonexistent.permission')).toBe(false);
    });
  });

  describe('Permission Lists', () => {
    test('should return list of granted permissions', () => {
      const ownerPermissions = getRolePermissionsList('owner');
      const demoPermissions = getRolePermissionsList('demo');
      
      expect(ownerPermissions.length).toBeGreaterThan(demoPermissions.length);
      expect(ownerPermissions).toContain('system.admin');
      expect(demoPermissions).toContain('ai.chat');
      expect(demoPermissions).not.toContain('system.admin');
    });
  });

  describe('Role Validation', () => {
    test('should validate correct roles', () => {
      expect(isValidRole('owner')).toBe(true);
      expect(isValidRole('family')).toBe(true);
      expect(isValidRole('friend')).toBe(true);
      expect(isValidRole('demo')).toBe(true);
    });

    test('should reject invalid roles', () => {
      expect(isValidRole('invalid')).toBe(false);
      expect(isValidRole('admin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(null)).toBe(false);
    });
  });

  describe('Role Hierarchy', () => {
    test('should correctly compare role privileges', () => {
      expect(roleHasHigherPrivileges('owner', 'family')).toBe(true);
      expect(roleHasHigherPrivileges('family', 'friend')).toBe(true);
      expect(roleHasHigherPrivileges('friend', 'demo')).toBe(true);
      
      expect(roleHasHigherPrivileges('demo', 'friend')).toBe(false);
      expect(roleHasHigherPrivileges('friend', 'family')).toBe(false);
      
      expect(roleHasHigherPrivileges('owner', 'owner')).toBe(true); // equal
      expect(roleHasHigherPrivileges('family', 'family')).toBe(true); // equal
    });
  });
});
