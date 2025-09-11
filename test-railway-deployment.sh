#!/bin/bash

# Test script for Alfred MCP Server on Railway
BASE_URL="https://alfred-server-production.up.railway.app"

echo "🔍 Testing Alfred MCP Server deployment..."
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq '.' || echo "Health check failed"
echo ""

# Test 2: MCP Connect
echo "2. Testing MCP connect..."
CONNECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "test-client"}')

echo "Connect response:"
echo "$CONNECT_RESPONSE" | jq '.'

# Extract session ID
SESSION_ID=$(echo "$CONNECT_RESPONSE" | jq -r '.sessionId // empty')

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to get session ID"
  exit 1
fi

echo "✅ Session ID: $SESSION_ID"
echo ""

# Test 3: MCP Text Command
echo "3. Testing MCP text command..."
TEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Hello Claude, tell me a short joke about programming\"}")

echo "Text response:"
echo "$TEXT_RESPONSE" | jq '.'

# Check if it's a mock or real response
if echo "$TEXT_RESPONSE" | grep -q "mock response"; then
  echo "⚠️  Using mock responses - Claude API key not configured"
else
  echo "✅ Real Claude responses active!"
fi

echo ""
echo "🎉 Test complete!"
