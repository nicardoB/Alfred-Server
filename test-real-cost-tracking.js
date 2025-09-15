#!/usr/bin/env node

/**
 * Test real cost tracking with configured API keys
 * Since API keys are configured, this should show actual usage
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testRealCostTracking() {
  console.log('🧪 Testing Real Cost Tracking with Configured API Keys...\n');

  try {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_CREDENTIALS)
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Authenticated');

    // Get initial costs
    console.log('\n📊 Getting initial cost data...');
    const initialResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const initialCosts = await initialResponse.json();
    
    console.log('Initial Summary:', {
      totalCost: initialCosts.data.summary.totalCost,
      totalRequests: initialCosts.data.summary.totalRequests,
      totalTokens: initialCosts.data.summary.totalTokens
    });

    console.log('Initial Provider Breakdown:');
    Object.entries(initialCosts.data.providers).forEach(([provider, data]) => {
      if (data.requests > 0) {
        console.log(`  ${provider}: ${data.requests} requests, ${data.inputTokens + data.outputTokens} tokens, $${data.totalCost}`);
      }
    });

    // Create MCP session
    console.log('\n🔗 Creating MCP session...');
    const sessionResponse = await fetch(`${BASE_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientInfo: { version: '1.0', name: 'real-cost-test' }
      })
    });

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ Session created:', sessionId);

    // Make multiple AI requests to ensure cost tracking
    console.log('\n🤖 Making AI requests to generate costs...');
    
    const requests = [
      'Write a short poem about artificial intelligence.',
      'Explain quantum computing in simple terms.',
      'What are the benefits of renewable energy?'
    ];

    for (let i = 0; i < requests.length; i++) {
      console.log(`Request ${i + 1}/3: "${requests[i].substring(0, 30)}..."`);
      
      const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          text: requests[i],
          metadata: { source: 'cost-test', requestIndex: i }
        })
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        console.log(`  ✅ Response from ${aiData.provider}: ${aiData.content?.length || 0} chars`);
      } else {
        console.log(`  ❌ Request failed: ${aiResponse.status}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait for cost tracking to process
    console.log('\n⏳ Waiting for cost tracking to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get updated costs
    console.log('\n📊 Getting updated cost data...');
    const updatedResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const updatedCosts = await updatedResponse.json();

    console.log('Updated Summary:', {
      totalCost: updatedCosts.data.summary.totalCost,
      totalRequests: updatedCosts.data.summary.totalRequests,
      totalTokens: updatedCosts.data.summary.totalTokens
    });

    console.log('Updated Provider Breakdown:');
    Object.entries(updatedCosts.data.providers).forEach(([provider, data]) => {
      if (data.requests > 0) {
        console.log(`  ${provider}: ${data.requests} requests, ${data.inputTokens + data.outputTokens} tokens, $${data.totalCost}`);
      }
    });

    // Calculate changes
    const costIncrease = updatedCosts.data.summary.totalCost - initialCosts.data.summary.totalCost;
    const requestIncrease = updatedCosts.data.summary.totalRequests - initialCosts.data.summary.totalRequests;
    const tokenIncrease = updatedCosts.data.summary.totalTokens - initialCosts.data.summary.totalTokens;

    console.log('\n📈 Changes Detected:');
    console.log(`Cost increase: $${costIncrease.toFixed(6)}`);
    console.log(`Request increase: ${requestIncrease}`);
    console.log(`Token increase: ${tokenIncrease}`);

    // Cleanup
    await fetch(`${BASE_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionId })
    });

    // Final validation
    console.log('\n🎯 VALIDATION RESULTS:');
    console.log('======================');
    
    if (requestIncrease >= 3) {
      console.log('✅ Request tracking: All 3 requests tracked');
    } else if (requestIncrease > 0) {
      console.log(`⚠️  Request tracking: Only ${requestIncrease} of 3 requests tracked`);
    } else {
      console.log('❌ Request tracking: No requests tracked');
    }

    if (tokenIncrease > 0) {
      console.log(`✅ Token tracking: ${tokenIncrease} tokens consumed`);
    } else {
      console.log('❌ Token tracking: No tokens tracked');
    }

    if (costIncrease > 0) {
      console.log(`✅ Cost tracking: $${costIncrease.toFixed(6)} in costs incurred`);
    } else {
      console.log('❌ Cost tracking: No costs tracked');
    }

    if (requestIncrease >= 1 && tokenIncrease > 0 && costIncrease > 0) {
      console.log('\n🎉 SUCCESS: Real cost tracking is working with configured API keys!');
    } else {
      console.log('\n❌ ISSUE: Cost tracking may not be working properly despite configured API keys.');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testRealCostTracking();
