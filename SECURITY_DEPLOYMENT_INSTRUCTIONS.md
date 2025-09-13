# CRITICAL SECURITY FIX - DEPLOYMENT INSTRUCTIONS

## 🚨 IMMEDIATE ACTION REQUIRED

The monitoring dashboard vulnerability has been fixed in the code, but you must deploy this fix to Railway immediately.

## Steps to Deploy Security Fix:

### 1. Set Environment Variable in Railway
Go to your Railway dashboard and add this environment variable:
```
MONITORING_API_KEY=2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731
```

### 2. Deploy the Code Changes
```bash
cd /Users/nbhatia/Documents/Projects/Alfred-Server
git add .
git commit -m "CRITICAL: Add authentication to monitoring endpoints"
git push origin main
```

### 3. Test the Security Fix
After deployment, test that authentication is working:

```bash
# This should now return 401 Unauthorized
curl https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard

# This should work with the API key
curl -H "x-api-key: 2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731" \
     https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard
```

## What Was Fixed:
- Added authentication middleware to ALL monitoring routes
- All monitoring endpoints now require `x-api-key` header
- Unauthorized access attempts are logged
- Generated secure 256-bit API key

## DEPLOY THIS IMMEDIATELY
The monitoring dashboard is currently exposing your AI usage costs and spending patterns to the public internet.
