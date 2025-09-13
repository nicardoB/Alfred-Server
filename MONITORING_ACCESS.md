# Alfred MCP Server Monitoring Access

## Secure API Key
```
MONITORING_API_KEY=2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731
```

## Access Commands

### Dashboard
```bash
curl -H "x-api-key: 2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731" \
     https://alfred-server-production.up.railway.app/api/v1/monitoring/dashboard
```

### Cost Statistics
```bash
curl -H "x-api-key: 2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731" \
     https://alfred-server-production.up.railway.app/api/v1/monitoring/costs
```

### Cost Projections
```bash
curl -H "x-api-key: 2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731" \
     https://alfred-server-production.up.railway.app/api/v1/monitoring/costs/projection
```

### Server Health
```bash
curl -H "x-api-key: 2d15157951163361db4fa962d4b1f46508409e0b7b17ae42a843305d5fa01731" \
     https://alfred-server-production.up.railway.app/api/v1/monitoring/health
```

## Security Status: ✅ SECURED
All monitoring endpoints now require authentication. Financial data is protected.
