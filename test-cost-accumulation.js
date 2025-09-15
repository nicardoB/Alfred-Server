#!/usr/bin/env node

/**
 * Test if costs are accumulating in database over multiple requests
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testCostAccumulation() {
  console.log('🔍 Testing cost accumulation over multiple requests...\n');

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
    const initialResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const initialCosts = await initialResponse.json();
    
    console.log('\n📊 Initial costs:');
    console.log(`Total cost: $${initialCosts.data.summary.totalCost}`);
    console.log(`Total requests: ${initialCosts.data.summary.totalRequests}`);
    console.log(`Total tokens: ${initialCosts.data.summary.totalTokens}`);

    // Create MCP session
    const sessionResponse = await fetch(`${BASE_URL}/api/v1/mcp/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientInfo: { version: '1.0', name: 'accumulation-test' }
      })
    });

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    console.log('✅ Session created');

    // Make 5 AI requests
    console.log('\n🤖 Making 5 AI requests...');
    for (let i = 1; i <= 5; i++) {
      const aiResponse = await fetch(`${BASE_URL}/api/v1/mcp/text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          text: `Request ${i}: Write a ${10 + i * 5} word response about technology.`,
          metadata: { source: 'accumulation-test', requestNumber: i }
        })
      });

      if (aiResponse.ok) {
        const data = await aiResponse.json();
        console.log(`  ${i}. Response from ${data.provider}: ${data.content.length} chars`);
      } else {
        console.log(`  ${i}. Failed: ${aiResponse.status}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Wait for processing
    console.log('\n⏳ Waiting for cost processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check costs after requests
    const finalResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const finalCosts = await finalResponse.json();

    console.log('\n📊 Final costs:');
    console.log(`Total cost: $${finalCosts.data.summary.totalCost}`);
    console.log(`Total requests: ${finalCosts.data.summary.totalRequests}`);
    console.log(`Total tokens: ${finalCosts.data.summary.totalTokens}`);

    // Calculate changes
    const costChange = finalCosts.data.summary.totalCost - initialCosts.data.summary.totalCost;
    const requestChange = finalCosts.data.summary.totalRequests - initialCosts.data.summary.totalRequests;
    const tokenChange = finalCosts.data.summary.totalTokens - initialCosts.data.summary.totalTokens;

    console.log('\n📈 CHANGES:');
    console.log(`Cost change: $${costChange.toFixed(6)}`);
    console.log(`Request change: ${requestChange}`);
    console.log(`Token change: ${tokenChange}`);

    console.log('\n🎯 RESULT:');
    if (requestChange >= 5 && tokenChange > 0 && costChange > 0) {
      console.log('✅ SUCCESS: Cost tracking is working! All metrics increased.');
    } else if (requestChange > 0 || tokenChange > 0 || costChange > 0) {
      console.log('⚠️  PARTIAL: Some cost tracking is working, but not all metrics.');
    } else {
      console.log('❌ FAILED: No cost tracking detected.');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/v1/mcp/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: sessionId })
    });

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCostAccumulation();
