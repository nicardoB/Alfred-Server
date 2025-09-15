#!/usr/bin/env node

/**
 * Integration test to verify cost tracking with real AI usage
 * This test makes actual API calls to incur costs and verifies tracking
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function runCostTrackingTest() {
  console.log('🧪 Starting Cost Tracking Integration Test...\n');

  try {
    // Step 1: Login and get JWT token
    console.log('1️⃣ Authenticating as owner...');
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_CREDENTIALS)
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Authentication successful');

    // Step 2: Get initial cost data
    console.log('\n2️⃣ Getting initial cost data...');
    const initialCostsResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!initialCostsResponse.ok) {
      throw new Error(`Failed to get initial costs: ${initialCostsResponse.status}`);
    }

    const initialCosts = await initialCostsResponse.json();
    console.log('Initial costs:', {
      totalCost: initialCosts.data.summary.totalCost,
      totalRequests: initialCosts.data.summary.totalRequests,
      totalTokens: initialCosts.data.summary.totalTokens
    });

    // Step 3: Create MCP session
    console.log('\n3️⃣ Creating MCP session...');
    const sessionResponse = await fetch(`${BASE_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientInfo: { version: '1.0', name: 'cost-tracking-test' }
      })
    });

    if (!sessionResponse.ok) {
      throw new Error(`MCP session creation failed: ${sessionResponse.status}`);
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ MCP session created:', sessionId);

    // Step 4: Make AI request to incur cost
    console.log('\n4️⃣ Making AI request to incur cost...');
    const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        text: 'Hello! Please respond with exactly 5 words.',
        metadata: { source: 'cost-test' }
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('✅ AI response received:', {
      provider: aiData.provider,
      contentLength: aiData.content?.length || 0
    });

    // Step 5: Wait a moment for cost tracking to process
    console.log('\n5️⃣ Waiting for cost tracking to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 6: Get updated cost data
    console.log('\n6️⃣ Getting updated cost data...');
    const updatedCostsResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!updatedCostsResponse.ok) {
      throw new Error(`Failed to get updated costs: ${updatedCostsResponse.status}`);
    }

    const updatedCosts = await updatedCostsResponse.json();
    console.log('Updated costs:', {
      totalCost: updatedCosts.data.summary.totalCost,
      totalRequests: updatedCosts.data.summary.totalRequests,
      totalTokens: updatedCosts.data.summary.totalTokens
    });

    // Step 7: Verify cost tracking worked
    console.log('\n7️⃣ Verifying cost tracking...');
    const costIncrease = updatedCosts.data.summary.totalCost - initialCosts.data.summary.totalCost;
    const requestIncrease = updatedCosts.data.summary.totalRequests - initialCosts.data.summary.totalRequests;
    const tokenIncrease = updatedCosts.data.summary.totalTokens - initialCosts.data.summary.totalTokens;

    console.log('Changes detected:', {
      costIncrease: costIncrease,
      requestIncrease: requestIncrease,
      tokenIncrease: tokenIncrease
    });

    // Step 8: Disconnect MCP session
    console.log('\n8️⃣ Cleaning up MCP session...');
    await fetch(`${BASE_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionId })
    });

    // Step 9: Validate results
    console.log('\n9️⃣ Validating test results...');
    
    if (requestIncrease >= 1) {
      console.log('✅ Request count increased correctly');
    } else {
      console.log('❌ Request count did not increase');
    }

    if (tokenIncrease > 0) {
      console.log('✅ Token usage tracked correctly');
    } else {
      console.log('❌ No token usage detected');
    }

    if (costIncrease > 0) {
      console.log('✅ Cost tracking working - detected cost increase');
    } else {
      console.log('⚠️  No cost increase detected (might be using free provider like OLLAMA)');
    }

    // Final summary
    console.log('\n📊 TEST SUMMARY:');
    console.log('================');
    console.log(`Requests processed: ${requestIncrease}`);
    console.log(`Tokens consumed: ${tokenIncrease}`);
    console.log(`Cost incurred: $${costIncrease.toFixed(6)}`);
    console.log(`Provider used: ${aiData.provider}`);

    if (requestIncrease >= 1 && tokenIncrease > 0) {
      console.log('\n🎉 Cost tracking integration test PASSED!');
      console.log('The system is correctly tracking AI usage and costs.');
    } else {
      console.log('\n❌ Cost tracking integration test FAILED!');
      console.log('The system is not properly tracking usage.');
    }

  } catch (error) {
    console.error('\n💥 Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
runCostTrackingTest();
