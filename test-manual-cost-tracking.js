#!/usr/bin/env node

/**
 * Test cost tracking by manually calling the cost tracker
 * This bypasses the AI providers to test the tracking system directly
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://alfred-server-production.up.railway.app';
const TEST_CREDENTIALS = {
  email: 'nick.bhatia@gmail.com',
  password: 'SecureOwner2024!'
};

async function testManualCostTracking() {
  console.log('🧪 Testing Manual Cost Tracking...\n');

  try {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_CREDENTIALS)
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;
    const userId = loginData.user.id;
    console.log('✅ Authenticated as:', userId);

    // Get initial costs
    console.log('\n📊 Getting initial cost data...');
    const initialResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const initialCosts = await initialResponse.json();
    console.log('Initial total cost:', initialCosts.data.summary.totalCost);
    console.log('Initial OpenAI requests:', initialCosts.data.providers.openai.requests);

    // Manually call the cost tracker endpoint (if it exists)
    // Since we can't directly access the cost tracker, let's make a request that should trigger it
    console.log('\n🔧 Testing cost tracking via direct database insertion...');
    
    // Create a test conversation first
    const conversationResponse = await fetch(`${BASE_URL}/api/v1/chat/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Cost Tracking Test',
        toolContext: 'chat'
      })
    });

    if (!conversationResponse.ok) {
      console.log('Conversation creation failed, trying alternative approach...');
    } else {
      const conversationData = await conversationResponse.json();
      console.log('✅ Test conversation created:', conversationData.conversation?.id);
    }

    // Try to populate test cost data using the monitoring endpoint
    console.log('\n📈 Attempting to populate test cost data...');
    const populateResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs/populate-test-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'openai',
        requests: 1,
        inputTokens: 50,
        outputTokens: 25,
        cost: 0.001
      })
    });

    if (populateResponse.ok) {
      console.log('✅ Test cost data populated');
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check updated costs
      console.log('\n📊 Getting updated cost data...');
      const updatedResponse = await fetch(`${BASE_URL}/api/v1/monitoring/costs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const updatedCosts = await updatedResponse.json();
      
      console.log('Updated total cost:', updatedCosts.data.summary.totalCost);
      console.log('Updated OpenAI requests:', updatedCosts.data.providers.openai.requests);
      console.log('Updated OpenAI tokens:', updatedCosts.data.providers.openai.inputTokens + updatedCosts.data.providers.openai.outputTokens);
      
      const costIncrease = updatedCosts.data.summary.totalCost - initialCosts.data.summary.totalCost;
      const requestIncrease = updatedCosts.data.providers.openai.requests - initialCosts.data.providers.openai.requests;
      
      if (costIncrease > 0 && requestIncrease > 0) {
        console.log('\n🎉 Cost tracking system is WORKING!');
        console.log(`Cost increase: $${costIncrease.toFixed(6)}`);
        console.log(`Request increase: ${requestIncrease}`);
      } else {
        console.log('\n❌ Cost tracking system not working properly');
      }
      
    } else {
      const errorText = await populateResponse.text();
      console.log('❌ Failed to populate test data:', populateResponse.status, errorText);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testManualCostTracking();
