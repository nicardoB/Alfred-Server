/**
 * Role-based permission system for Alfred AI Assistant
 * Defines permissions for different user roles and system access levels
 */

// Base permissions for each role
export const ROLE_PERMISSIONS = {
  owner: {
    // Full system access
    'system.admin': true,
    'system.config': true,
    'system.users': true,
    'system.audit': true,
    
    // Monitoring and analytics
    'monitoring.dashboard': true,
    'monitoring.costs': true,
    'monitoring.health': true,
    'monitoring.logs': true,
    
    // AI and MCP access
    'ai.chat': true,
    'ai.voice': true,
    'ai.advanced': true,
    'mcp.full': true,
    
    // Applications
    'poker.coach': true,
    'poker.analytics': true,
    
    // Budget management
    'budget.unlimited': true,
    'budget.view': true,
    'budget.modify': true
  },
  
  family: {
    // Limited system access
    'system.config': false,
    'system.users': false,
    'system.audit': false,
    
    // Basic monitoring
    'monitoring.dashboard': true,
    'monitoring.costs': true,
    'monitoring.health': false,
    'monitoring.logs': false,
    
    // AI access with limits
    'ai.chat': true,
    'ai.voice': true,
    'ai.advanced': true,
    'mcp.limited': true,
    
    // Applications
    'poker.coach': true,
    'poker.analytics': false,
    
    // Budget constraints
    'budget.unlimited': false,
    'budget.view': true,
    'budget.modify': false
  },
  
  friend: {
    // No system access
    'system.config': false,
    'system.users': false,
    'system.audit': false,
    
    // No monitoring access
    'monitoring.dashboard': false,
    'monitoring.costs': false,
    'monitoring.health': false,
    'monitoring.logs': false,
    
    // Basic AI access
    'ai.chat': true,
    'ai.voice': true,
    'ai.advanced': false,
    'mcp.basic': true,
    
    // Limited applications
    'poker.coach': true,
    'poker.analytics': false,
    
    // Strict budget limits
    'budget.unlimited': false,
    'budget.view': true,
    'budget.modify': false
  },
  
  demo: {
    // No system access
    'system.config': false,
    'system.users': false,
    'system.audit': false,
    
    // No monitoring
    'monitoring.dashboard': false,
    'monitoring.costs': false,
    'monitoring.health': false,
    'monitoring.logs': false,
    
    // Very limited AI access
    'ai.chat': true,
    'ai.voice': false,
    'ai.advanced': false,
    'mcp.demo': true,
    
    // Demo applications only
    'poker.coach': false,
    'poker.analytics': false,
    
    // No budget access
    'budget.unlimited': false,
    'budget.view': false,
    'budget.modify': false
  }
};

// Monthly budget limits by role (in USD)
export const ROLE_BUDGETS = {
  owner: null, // unlimited
  family: 35.00,
  friend: 10.00,
  demo: 2.00
};

// Rate limits by role (requests per hour)
export const ROLE_RATE_LIMITS = {
  owner: 1000,
  family: 200,
  friend: 50,
  demo: 10
};

// AI provider access by role
export const ROLE_AI_PROVIDERS = {
  owner: ['claude', 'claude-haiku', 'openai', 'copilot'],
  family: ['claude', 'claude-haiku', 'openai'],
  friend: ['claude-haiku', 'openai'],
  demo: ['claude-haiku']
};

/**
 * Get permissions for a user role
 */
export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.demo;
}

/**
 * Get budget limit for a user role
 */
export function getRoleBudget(role) {
  return ROLE_BUDGETS[role] || ROLE_BUDGETS.demo;
}

/**
 * Get rate limit for a user role
 */
export function getRoleRateLimit(role) {
  return ROLE_RATE_LIMITS[role] || ROLE_RATE_LIMITS.demo;
}

/**
 * Get allowed AI providers for a user role
 */
export function getRoleAIProviders(role) {
  return ROLE_AI_PROVIDERS[role] || ROLE_AI_PROVIDERS.demo;
}

/**
 * Check if a role has a specific permission
 */
export function hasRolePermission(role, permission) {
  const permissions = getRolePermissions(role);
  return permissions[permission] === true;
}

/**
 * Get all permissions as a flat array for a role
 */
export function getRolePermissionsList(role) {
  const permissions = getRolePermissions(role);
  return Object.keys(permissions).filter(key => permissions[key] === true);
}

/**
 * Validate role name
 */
export function isValidRole(role) {
  return ['owner', 'family', 'friend', 'demo'].includes(role);
}

/**
 * Get role hierarchy (higher roles include lower role permissions)
 */
export function getRoleHierarchy() {
  return {
    owner: 4,
    family: 3,
    friend: 2,
    demo: 1
  };
}

/**
 * Check if role A has higher or equal privileges than role B
 */
export function roleHasHigherPrivileges(roleA, roleB) {
  const hierarchy = getRoleHierarchy();
  return hierarchy[roleA] >= hierarchy[roleB];
}
