#!/bin/bash

# Test script to verify Claude API key configuration
BASE_URL="https://alfred-server-production.up.railway.app"

echo "🔍 Testing Claude API key configuration..."
echo ""

# Get fresh session
echo "1. Getting fresh session..."
CONNECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "api-key-test"}')

SESSION_ID=$(echo "$CONNECT_RESPONSE" | jq -r '.sessionId // empty')
echo "Session ID: $SESSION_ID"
echo ""

# Test Claude with different queries
echo "2. Testing Claude responses..."

# Test 1: Simple query
echo "Test 1 - Simple query:"
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Hello Claude\"}")

echo "$RESPONSE1" | jq '.'
CONTENT1=$(echo "$RESPONSE1" | jq -r '.content // empty')
PROVIDER1=$(echo "$RESPONSE1" | jq -r '.provider // empty')
echo "Provider: $PROVIDER1, Content: $CONTENT1"
echo ""

# Test 2: Complex reasoning (should definitely go to Claude)
echo "Test 2 - Complex reasoning query:"
RESPONSE2=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Analyze the philosophical implications of artificial intelligence\"}")

echo "$RESPONSE2" | jq '.'
CONTENT2=$(echo "$RESPONSE2" | jq -r '.content // empty')
PROVIDER2=$(echo "$RESPONSE2" | jq -r '.provider // empty')
echo "Provider: $PROVIDER2, Content: $CONTENT2"
echo ""

# Check results
if [[ "$CONTENT1" == "No response" && "$CONTENT2" == "No response" ]]; then
  echo "❌ API key not working - still getting mock responses"
  echo "Possible issues:"
  echo "  - Railway hasn't restarted yet after adding the key"
  echo "  - API key is invalid or malformed"
  echo "  - Environment variable name is incorrect (should be ANTHROPIC_API_KEY)"
elif [[ "$CONTENT1" != "No response" || "$CONTENT2" != "No response" ]]; then
  echo "✅ API key working - getting real Claude responses!"
else
  echo "⚠️  Mixed results - check individual responses above"
fi
