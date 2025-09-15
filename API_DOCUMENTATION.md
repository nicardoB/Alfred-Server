# Alfred Server API Documentation

## Overview

Alfred Server provides a comprehensive AI-powered chat system with cost tracking, authentication, and multi-provider AI routing. This documentation covers the main API endpoints and their usage.

## Base URL

**Production**: `https://alfred-server-production.up.railway.app`

## Authentication

All API endpoints require authentication using one of the following methods:

### JWT Token Authentication
```http
Authorization: Bearer <jwt_token>
```

### API Key Authentication
```http
x-api-key: <api_key>
```

## Core API Endpoints

### 1. Authentication Endpoints

#### POST /api/v1/auth/login
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "role": "owner",
    "permissions": {
      "ai.chat": true,
      "monitoring.costs": true
    }
  }
}
```

#### POST /api/v1/auth/setup-owner
Create initial owner account (requires setup key).

**Request Body:**
```json
{
  "email": "owner@example.com",
  "password": "securePassword123!",
  "setupKey": "setup-key-from-environment"
}
```

### 2. MCP (Model Context Protocol) Endpoints

#### POST /api/v1/mcp/connect
Establish a new MCP session.

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "e7a04a84-1483-4be7-9a3e-5915459caf60",
  "timestamp": "2025-09-15T22:29:55.080Z"
}
```

#### POST /api/v1/mcp/text
Send text command to AI system with cost tracking.

**Request Body:**
```json
{
  "sessionId": "e7a04a84-1483-4be7-9a3e-5915459caf60",
  "text": "Hello! Please explain artificial intelligence."
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "e7a04a84-1483-4be7-9a3e-5915459caf60",
  "requestId": "55444988-73ff-4e3b-96c7-8c98340dbd34",
  "content": "AI response content...",
  "confidence": 0.9,
  "provider": "openai",
  "timestamp": "2025-09-15T22:30:18.704Z"
}
```

### 3. Cost Monitoring Endpoints

#### GET /api/v1/monitoring/costs
Get comprehensive cost statistics for all AI providers.

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCost": 0.066603,
      "totalRequests": 9,
      "totalInputTokens": 10930,
      "totalOutputTokens": 6173,
      "totalTokens": 17103,
      "avgCostPerToken": 0.00000389,
      "avgTokensPerRequest": 1900,
      "currency": "USD"
    },
    "byProvider": {
      "claude": {
        "requests": 3,
        "inputTokens": 4500,
        "outputTokens": 2400,
        "totalTokens": 6900,
        "totalCost": 0.0495,
        "lastReset": "2025-09-15T22:27:12.926Z",
        "avgCostPerRequest": 0.0165,
        "avgCostPerToken": 0.00000717,
        "avgTokensPerRequest": 2300
      },
      "openai": {
        "requests": 4,
        "inputTokens": 3930,
        "outputTokens": 2523,
        "totalTokens": 6453,
        "totalCost": 0.002103,
        "lastReset": "2025-09-15T22:27:12.947Z",
        "avgCostPerRequest": 0.000526,
        "avgCostPerToken": 3.3E-7,
        "avgTokensPerRequest": 1613
      },
      "copilot": {
        "requests": 2,
        "inputTokens": 2500,
        "outputTokens": 1250,
        "totalTokens": 3750,
        "totalCost": 0.015,
        "lastReset": "2025-09-15T22:27:12.967Z",
        "avgCostPerRequest": 0.0075,
        "avgCostPerToken": 0.000004,
        "avgTokensPerRequest": 1875
      }
    },
    "timestamp": "2025-09-15T22:30:34.073Z"
  }
}
```

#### POST /api/v1/monitoring/costs/reset
Reset cost statistics for specific provider or all providers.

**Request Body:**
```json
{
  "provider": "openai"  // Optional: omit to reset all providers
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cost statistics reset for openai"
}
```

#### GET /api/v1/monitoring/costs/projection
Get cost projections for specified time period.

**Query Parameters:**
- `days` (optional): Number of days for projection (default: 30)

**Response:**
```json
{
  "success": true,
  "projection": {
    "dailyAverage": 0.007,
    "projectedCost": 0.21,
    "period": 30,
    "currency": "USD"
  }
}
```

### 4. Chat Endpoints

#### POST /api/v1/chat/conversations
Create a new conversation.

**Request Body:**
```json
{
  "title": "My Conversation",
  "toolContext": "chat"
}
```

**Response:**
```json
{
  "conversation": {
    "id": "0293958e-cfec-4192-96dc-5fc4d90654ea",
    "title": "My Conversation",
    "toolContext": "chat",
    "totalCost": "0.000000",
    "messageCount": 0,
    "createdAt": "2025-09-15T22:29:05.256Z"
  }
}
```

### 5. Health Endpoints

#### GET /api/v1/health
Get server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-15T22:23:40.034Z",
  "version": "2.0.0-DEPLOYMENT-TEST",
  "uptime": 93.948608453
}
```

## Cost Tracking System

### CostTracker API

The cost tracking system uses a unified API signature for tracking AI usage across all providers:

```javascript
await costTracker.trackUsage({
  provider: 'openai',           // AI provider name
  inputTokens: 100,             // Number of input tokens
  outputTokens: 50,             // Number of output tokens
  userId: 'user-id',            // User identifier
  toolContext: 'chat',          // Tool context (chat, poker, code, etc.)
  model: 'gpt-4o-mini',         // AI model used
  conversationId: 'conv-id',    // Conversation identifier (optional)
  messageId: 'msg-id',          // Message identifier (optional)
  sessionId: 'session-id'       // Session identifier (optional)
});
```

### Supported Providers

- **OpenAI**: GPT models with token-based pricing
- **Claude**: Anthropic Claude models with token-based pricing
- **GitHub Copilot**: Code generation with request-based pricing
- **Ollama**: Local models (free, estimated tokens)

### Cost Calculation

Costs are calculated based on provider-specific pricing:

- **OpenAI GPT-4o-mini**: $0.00015/1K input tokens, $0.0006/1K output tokens
- **Claude Sonnet**: $3.00/1M input tokens, $15.00/1M output tokens
- **GitHub Copilot**: $0.004 per request
- **Ollama**: Free (local execution)

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Common Error Codes

- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

## Rate Limits

Rate limits are enforced per user role:

- **Owner**: 1000 requests/hour
- **Family**: 200 requests/hour  
- **Friend**: 50 requests/hour
- **Demo**: 10 requests/hour

## WebSocket Integration

Real-time features are available via WebSocket connection at `/socket.io` with authentication required.

### Events

- `chat_message`: Real-time chat messages
- `cost_update`: Live cost tracking updates
- `ai_response`: Streaming AI responses

## Security

- All endpoints require authentication
- JWT tokens expire after 24 hours
- API keys support fine-grained permissions
- Rate limiting prevents abuse
- Audit logging tracks all actions
- CORS configured for production domains

## Testing

The API includes comprehensive test coverage:

- **Integration Tests**: 11/11 passing
- **Unit Tests**: Core functionality tested
- **E2E Tests**: Complete workflows validated
- **Production Tests**: Real API calls verified

## Support

For technical support or questions about the API, contact the development team or refer to the source code documentation.
