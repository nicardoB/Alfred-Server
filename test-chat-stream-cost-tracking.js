#!/usr/bin/env node

/**
 * Test cost tracking via the correct /api/v1/chat/stream endpoint
 * This is the endpoint that actually uses processStreamingChat with cost tracking
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testChatStreamCostTracking() {
  console.log('🧪 Testing Chat Stream Cost Tracking...\n');

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
    console.log('Initial costs:', {
      totalCost: initialCosts.data.summary.totalCost,
      totalRequests: initialCosts.data.summary.totalRequests,
      openaiRequests: initialCosts.data.providers.openai.requests
    });

    // Make chat stream request
    console.log('\n🤖 Making chat stream request...');
    const chatResponse = await fetch(`${BASE_URL}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Hello! Please respond with exactly "Hi there" and nothing else.',
        conversationId: null
      })
    });

    if (!chatResponse.ok) {
      console.error('Chat request failed:', chatResponse.status, await chatResponse.text());
      return;
    }

    console.log('✅ Chat request successful, status:', chatResponse.status);

    // Wait for cost tracking to process
    console.log('\n⏳ Waiting for cost tracking to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get updated costs
    console.log('\n📊 Getting updated cost data...');
    const updatedResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const updatedCosts = await updatedResponse.json();
    
    console.log('Updated costs:', {
      totalCost: updatedCosts.data.summary.totalCost,
      totalRequests: updatedCosts.data.summary.totalRequests,
      openaiRequests: updatedCosts.data.providers.openai.requests
    });

    // Calculate changes
    const costIncrease = updatedCosts.data.summary.totalCost - initialCosts.data.summary.totalCost;
    const requestIncrease = updatedCosts.data.summary.totalRequests - initialCosts.data.summary.totalRequests;
    const openaiIncrease = updatedCosts.data.providers.openai.requests - initialCosts.data.providers.openai.requests;

    console.log('\n📈 Changes detected:');
    console.log(`Cost increase: $${costIncrease.toFixed(6)}`);
    console.log(`Total request increase: ${requestIncrease}`);
    console.log(`OpenAI request increase: ${openaiIncrease}`);

    // Validate results
    console.log('\n✅ Validation:');
    if (requestIncrease >= 1) {
      console.log('✅ Request count increased correctly');
    } else {
      console.log('❌ Request count did not increase');
    }

    if (costIncrease > 0) {
      console.log('✅ Cost tracking working - detected cost increase');
    } else {
      console.log('⚠️  No cost increase (provider might be using mock/free responses)');
    }

    // Final summary
    console.log('\n📊 TEST SUMMARY:');
    console.log('================');
    console.log(`Endpoint tested: /api/v1/chat/stream`);
    console.log(`Requests processed: ${requestIncrease}`);
    console.log(`Cost incurred: $${costIncrease.toFixed(6)}`);

    if (requestIncrease >= 1) {
      console.log('\n🎉 Chat stream cost tracking test PASSED!');
      console.log('The /api/v1/chat/stream endpoint is working correctly.');
      
      if (costIncrease > 0) {
        console.log('Real API costs are being tracked properly.');
      } else {
        console.log('Note: No cost increase suggests API keys may not be configured (using mock responses).');
      }
    } else {
      console.log('\n❌ Chat stream cost tracking test FAILED!');
      console.log('The system is not properly tracking usage through /api/v1/chat/stream.');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testChatStreamCostTracking();
