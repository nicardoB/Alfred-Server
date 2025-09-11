#!/bin/bash

# Debug script to check environment variable status
BASE_URL="https://alfred-server-production.up.railway.app"

echo "🔍 Debugging environment variable configuration..."
echo ""

# Test with a simple query that should trigger mock response if no API key
echo "Testing with simple query to check mock vs real response..."

SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "debug-test"}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')
echo "Session ID: $SESSION_ID"

# Test Claude with a simple message
CLAUDE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Hi\"}")

echo ""
echo "Full Claude Response:"
echo "$CLAUDE_RESPONSE" | jq '.'

CONTENT=$(echo "$CLAUDE_RESPONSE" | jq -r '.content')
CONFIDENCE=$(echo "$CLAUDE_RESPONSE" | jq -r '.confidence')

echo ""
echo "Analysis:"
if [[ "$CONTENT" == *"Claude mock response to:"* ]]; then
  echo "❌ API key missing - getting expected mock response"
elif [[ "$CONTENT" == "No response" ]]; then
  echo "⚠️  API error - key might be present but invalid/malformed"
  echo "   This suggests the API call is being attempted but failing"
elif [[ "$CONTENT" != "No response" && "$CONTENT" != *"mock"* ]]; then
  echo "✅ API key working - getting real Claude response!"
else
  echo "🤔 Unexpected response pattern"
fi

echo ""
echo "Expected patterns:"
echo "  - No API key: 'Claude mock response to: Hi' (confidence: 0.9)"
echo "  - Invalid API key: 'No response' (confidence: 0.1)"  
echo "  - Valid API key: Real Claude response (confidence: 0.95)"
echo ""
echo "Actual: '$CONTENT' (confidence: $CONFIDENCE)"
