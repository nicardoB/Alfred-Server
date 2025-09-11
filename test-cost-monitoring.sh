#!/bin/bash

# Test script for cost monitoring system
BASE_URL="https://alfred-server-production.up.railway.app"

echo "🔍 Testing Cost Monitoring System..."
echo ""

# Test 1: Get current cost statistics
echo "1. Current cost statistics:"
curl -s "$BASE_URL/api/v1/monitoring/costs" | jq '.'
echo ""

# Test 2: Get monitoring health
echo "2. Monitoring health:"
curl -s "$BASE_URL/api/v1/monitoring/health" | jq '.'
echo ""

# Test 3: Make some AI requests to generate cost data
echo "3. Making AI requests to generate cost data..."

# Get session
SESSION_ID=$(curl -s -X POST "$BASE_URL/api/v1/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "cost-test"}' | jq -r '.sessionId')

echo "Session ID: $SESSION_ID"

# Test Claude (complex query)
echo "Testing Claude..."
curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Explain quantum computing in simple terms\"}" | jq '.provider, .content' | head -2

# Test OpenAI (simple query)
echo "Testing OpenAI..."
curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"What is 5+5?\"}" | jq '.provider, .content'

# Test GitHub Copilot (code query)
echo "Testing GitHub Copilot..."
curl -s -X POST "$BASE_URL/api/v1/mcp/text" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"text\": \"How do I create a React component?\"}" | jq '.provider, .content'

echo ""

# Test 4: Check updated cost statistics
echo "4. Updated cost statistics after requests:"
curl -s "$BASE_URL/api/v1/monitoring/costs" | jq '.'
echo ""

# Test 5: Get cost projection
echo "5. Cost projection (30 days):"
curl -s "$BASE_URL/api/v1/monitoring/costs/projection" | jq '.'
echo ""

echo "🎉 Cost monitoring test complete!"
