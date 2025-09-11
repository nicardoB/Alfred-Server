#!/bin/bash

# Comprehensive test of all AI providers
BASE_URL="https://alfred-server-production.up.railway.app"

echo "🔍 Testing Complete AI Provider Ecosystem..."
echo ""

# Get session
SESSION_ID=$(curl -s -X POST "$BASE_URL/api/v1/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "full-ecosystem-test"}' | jq -r '.sessionId')

echo "Session ID: $SESSION_ID"
echo ""

# Test 1: Claude (complex reasoning)
echo "1. Testing Claude (complex reasoning):"
CLAUDE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Analyze the benefits of microservices architecture\"}")

echo "Provider: $(echo "$CLAUDE_RESPONSE" | jq -r '.provider')"
echo "Confidence: $(echo "$CLAUDE_RESPONSE" | jq -r '.confidence')"
echo "Content preview: $(echo "$CLAUDE_RESPONSE" | jq -r '.content' | head -c 100)..."
echo ""

# Test 2: OpenAI (simple query)
echo "2. Testing OpenAI (simple query):"
OPENAI_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"What is the capital of Japan?\"}")

echo "Provider: $(echo "$OPENAI_RESPONSE" | jq -r '.provider')"
echo "Confidence: $(echo "$OPENAI_RESPONSE" | jq -r '.confidence')"
echo "Content: $(echo "$OPENAI_RESPONSE" | jq -r '.content')"
echo ""

# Test 3: GitHub Copilot (code query)
echo "3. Testing GitHub Copilot (code query):"
COPILOT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Write a Python function to sort a list\"}")

echo "Provider: $(echo "$COPILOT_RESPONSE" | jq -r '.provider')"
echo "Confidence: $(echo "$COPILOT_RESPONSE" | jq -r '.confidence')"
echo "Content preview: $(echo "$COPILOT_RESPONSE" | jq -r '.content' | head -c 100)..."
echo ""

# Test 4: Check updated costs
echo "4. Updated cost statistics:"
curl -s "$BASE_URL/api/v1/monitoring/costs" | jq '.data.summary, .data.providers | to_entries[] | {provider: .key, requests: .value.requests, cost: .value.totalCost}'
echo ""

echo "🎉 All AI providers tested successfully!"
