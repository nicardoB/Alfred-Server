#!/usr/bin/env node

/**
 * Test cost tracking against production database
 */

import fetch from 'node-fetch';

const PRODUCTION_URL = 'https://alfred-server-production.up.railway.app';

async function testProductionCostTracking() {
  console.log('🧪 Testing cost tracking against production...\n');

  try {
    // Step 1: Authenticate and get JWT token
    console.log('🔐 Authenticating...');
    const authResponse = await fetch(`${PRODUCTION_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'owner',
        password: 'secure_owner_password_2024'
      })
    });

    if (!authResponse.ok) {
      throw new Error(`Auth failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    const token = authData.token;
    console.log('✅ Authentication successful');

    // Step 2: Get initial cost stats
    console.log('\n📊 Getting initial cost stats...');
    const initialStatsResponse = await fetch(`${PRODUCTION_URL}/api/v1/monitoring/usage`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!initialStatsResponse.ok) {
      throw new Error(`Failed to get initial stats: ${initialStatsResponse.status}`);
    }

    const initialStats = await initialStatsResponse.json();
    console.log('Initial stats:', {
      totalCost: initialStats.summary?.totalCost || 0,
      totalRequests: initialStats.summary?.totalRequests || 0,
      totalTokens: initialStats.summary?.totalTokens || 0
    });

    // Step 3: Create MCP session
    console.log('\n🔗 Creating MCP session...');
    const sessionResponse = await fetch(`${PRODUCTION_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId: 'test-cost-tracking',
        metadata: { source: 'cost-test' }
      })
    });

    if (!sessionResponse.ok) {
      throw new Error(`Session creation failed: ${sessionResponse.status}`);
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ MCP session created:', sessionId);

    // Step 4: Send AI request that should trigger cost tracking
    console.log('\n🤖 Sending AI request...');
    const aiResponse = await fetch(`${PRODUCTION_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        text: 'Hello! This is a test message to verify cost tracking is working properly. Please respond with a brief acknowledgment.',
        metadata: { testId: 'cost-tracking-verification' }
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('✅ AI response received:', {
      hasResponse: !!aiData.response,
      responseLength: aiData.response?.length || 0
    });

    // Step 5: Wait a moment for cost tracking to process
    console.log('\n⏳ Waiting for cost tracking to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 6: Get final cost stats
    console.log('\n📊 Getting final cost stats...');
    const finalStatsResponse = await fetch(`${PRODUCTION_URL}/api/v1/monitoring/usage`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!finalStatsResponse.ok) {
      throw new Error(`Failed to get final stats: ${finalStatsResponse.status}`);
    }

    const finalStats = await finalStatsResponse.json();
    console.log('Final stats:', {
      totalCost: finalStats.summary?.totalCost || 0,
      totalRequests: finalStats.summary?.totalRequests || 0,
      totalTokens: finalStats.summary?.totalTokens || 0
    });

    // Step 7: Calculate changes
    const costChange = (finalStats.summary?.totalCost || 0) - (initialStats.summary?.totalCost || 0);
    const requestChange = (finalStats.summary?.totalRequests || 0) - (initialStats.summary?.totalRequests || 0);
    const tokenChange = (finalStats.summary?.totalTokens || 0) - (initialStats.summary?.totalTokens || 0);

    console.log('\n📈 CHANGES:');
    console.log(`Cost change: $${costChange.toFixed(6)}`);
    console.log(`Request change: ${requestChange}`);
    console.log(`Token change: ${tokenChange}`);

    // Step 8: Cleanup - disconnect session
    await fetch(`${PRODUCTION_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionId })
    });

    console.log('\n🎯 RESULT:');
    if (requestChange >= 1 && tokenChange > 0 && costChange > 0) {
      console.log('✅ SUCCESS: Cost tracking is working in production!');
      return true;
    } else if (requestChange >= 1) {
      console.log('⚠️  PARTIAL: Requests tracked but cost/token tracking may have issues.');
      return false;
    } else {
      console.log('❌ FAILED: Cost tracking not working in production.');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

testProductionCostTracking();
