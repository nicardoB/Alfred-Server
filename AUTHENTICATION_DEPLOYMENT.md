# Authentication System Deployment Instructions

## Overview
This document provides step-by-step instructions for deploying the new authentication system to the Alfred MCP Server. The authentication system includes user management, role-based access control, API key management, and comprehensive audit logging.

## Prerequisites
- Railway account with Alfred-Server project deployed
- Access to Railway environment variables
- Git repository access for code deployment

## Environment Variables Required

Add these environment variables to your Railway deployment:

```bash
# Authentication & Security
JWT_SECRET=your-super-secure-jwt-secret-change-in-production-256-bit-minimum
OWNER_SETUP_KEY=your-secure-owner-setup-key-change-this

# Existing variables (keep these)
MONITORING_API_KEY=2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731
DATABASE_URL=postgresql://...
CLAUDE_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
# ... other existing variables
```

### Generate Secure Keys

```bash
# Generate JWT Secret (256-bit)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Owner Setup Key (256-bit)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Steps

### Step 1: Set Environment Variables in Railway

1. Go to Railway dashboard → Alfred-Server project
2. Navigate to Variables tab
3. Add the new environment variables:
   - `JWT_SECRET`: Use generated 256-bit key
   - `OWNER_SETUP_KEY`: Use generated 256-bit key

### Step 2: Deploy Code Changes

```bash
# Commit and push authentication system
cd /path/to/Alfred-Server
git add .
git commit -m "feat: implement comprehensive authentication system

- Add User, Session, ApiKey, AuditLog models
- Implement JWT and API key authentication middleware
- Add role-based permissions (owner/family/friend/demo)
- Secure all MCP, audio, and session endpoints
- Add comprehensive audit logging
- Create owner setup process"

git push origin main
```

### Step 3: Database Migration

The new authentication tables will be created automatically when the server starts due to `sequelize.sync({ alter: true })` in the database configuration.

Tables created:
- `users` - User accounts with roles and permissions
- `sessions` - JWT session management
- `api_keys` - API key management with permissions
- `audit_logs` - Comprehensive security audit logging

### Step 4: Create Owner Account

After deployment, create the initial owner account:

```bash
curl -X POST https://alfred-server-production.up.railway.app/api/v1/auth/setup-owner \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@domain.com",
    "password": "your-secure-password",
    "setupKey": "your-owner-setup-key-from-env"
  }'
```

**Save the returned API key securely - it will not be shown again.**

### Step 5: Test Authentication

```bash
# Test owner login
curl -X POST https://alfred-server-production.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@domain.com",
    "password": "your-secure-password"
  }'

# Test monitoring access with new authentication
curl -H "x-api-key: YOUR_OWNER_API_KEY" \
  https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard

# Test MCP endpoint (should require authentication now)
curl -X POST https://alfred-server-production.up.railway.app/api/v1/mcp/connect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientInfo": {"version": "1.0"}}'
```

## Security Features Implemented

### Authentication Methods
- **JWT Tokens**: For session-based authentication (24-hour expiry)
- **API Keys**: For programmatic access with fine-grained permissions
- **Role-based Access**: Owner, Family, Friend, Demo roles with different privileges

### Security Measures
- **Password Hashing**: bcrypt with 12 rounds
- **Account Lockout**: 5 failed attempts = 30-minute lockout
- **Rate Limiting**: Per-role request limits (Owner: 1000/hr, Family: 200/hr, Friend: 50/hr, Demo: 10/hr)
- **Audit Logging**: All authentication events and API access logged
- **Session Management**: Secure session tracking with device info

### Endpoint Security
- **MCP Routes** (`/api/v1/mcp/*`): Require Friend+ role, 200 req/hr limit
- **Audio Routes** (`/api/v1/audio/*`): Require Friend+ role, 100 req/hr limit  
- **Session Routes** (`/api/v1/session/*`): Require Friend+ role, 50 req/hr limit
- **Monitoring Routes** (`/api/v1/monitoring/*`): Require Owner role (existing MONITORING_API_KEY still works)

## Role Permissions

### Owner
- Full system access including user management
- Unlimited budget and AI provider access
- All monitoring and audit capabilities

### Family  
- AI chat and voice access with $35/month budget
- Basic monitoring dashboard access
- Poker coach access

### Friend
- Basic AI chat access with $10/month budget
- Limited AI providers (no advanced models)
- Poker coach access

### Demo
- Very limited AI chat access with $2/month budget
- Basic AI providers only
- No poker coach or monitoring access

## Troubleshooting

### Common Issues

1. **Authentication fails after deployment**
   - Check JWT_SECRET is set correctly
   - Verify database migration completed successfully

2. **Owner setup fails**
   - Verify OWNER_SETUP_KEY matches environment variable
   - Check if owner account already exists

3. **Existing monitoring access broken**
   - The existing MONITORING_API_KEY still works for monitoring endpoints
   - New authentication is additive, not replacing existing security

### Rollback Plan

If issues occur, you can temporarily disable authentication by:
1. Comment out authentication middleware in route files
2. Redeploy with authentication disabled
3. Debug and fix issues
4. Re-enable authentication

## Next Steps

After successful deployment:
1. Create additional user accounts as needed
2. Generate API keys for different applications
3. Monitor audit logs for security events
4. Set up regular security reviews

## Support

For issues with deployment:
1. Check Railway deployment logs
2. Review audit logs in database
3. Verify all environment variables are set correctly
4. Test authentication endpoints individually
