# Railway PostgreSQL Setup Guide

## Problem
Railway uses ephemeral filesystem, so SQLite databases are wiped on every deployment. This requires recreating owner accounts after each deployment.

## Solution: Add PostgreSQL Database

### Step 1: Add PostgreSQL Service
1. Go to Railway dashboard
2. Click "New" → "Database" → "Add PostgreSQL"
3. This will create a new PostgreSQL service in your project

### Step 2: Get Database URL
1. Click on the PostgreSQL service
2. Go to "Connect" tab
3. Copy the "DATABASE_URL" connection string

### Step 3: Set Environment Variable
1. Go to your Alfred-Server service
2. Click "Variables" tab
3. Add new variable:
   - Name: `DATABASE_URL`
   - Value: (paste the PostgreSQL connection string)

### Step 4: Deploy
1. Push any code change to trigger deployment
2. Railway will automatically use PostgreSQL instead of SQLite
3. Database will persist across deployments

### Step 5: Create Owner Account (One Time)
```bash
# After first PostgreSQL deployment
node create-secure-owner.js
```

## Benefits
- ✅ Database persists across deployments
- ✅ No need to recreate owner accounts
- ✅ Better performance and reliability
- ✅ Proper production database setup

## Cost
- PostgreSQL on Railway: ~$5/month for basic usage
- Much better than recreating accounts after every deployment

## Verification
Check that `DATABASE_URL` environment variable is set and starts with `postgresql://`
